/** Words that never make a brand on their own ("Шаурма на …", "Doner біля …"). */
const GENERIC = new Set([
  'шаурма', 'шаверма', 'шаурмечна', 'кебаб', 'кебабна', 'донер', 'дьонер', 'doner', 'döner', 'kebab', 'kebap', 'shawarma', 'shaurma',
  'на', 'біля', 'у', 'в', 'від', 'and', 'the', 'гриль', 'grill', 'food', 'фуд', 'street', 'смачна', 'найкраща', 'best',
]);

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const tokens = (norm: string) => (norm ? norm.split(' ') : []);

function commonPrefix(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) out.push(a[i]!);
  return out;
}

const isBrand = (prefix: string[]) => prefix.some((t) => !GENERIC.has(t) && t.length >= 2) && prefix.join(' ').length >= 4;

/** The leading words of the original name that cover `count` normalized tokens (keeps "Кебаб-Шеф" spelling). */
function displayPrefix(original: string, count: number): string {
  const words = original.trim().split(/\s+/);
  const out: string[] = [];
  let used = 0;
  for (const w of words) {
    if (used >= count) break;
    out.push(w);
    used += tokens(normalizeName(w)).length;
  }
  return out.join(' ').replace(/[,.;:!]+$/, '');
}

/**
 * Links a place to a chain (spec §8): an existing chain whose name prefixes this place's name, or a new chain
 * when another place in the city shares a non-generic name prefix.
 */
export async function assignChain(db: D1Database, placeId: number): Promise<number | null> {
  const place = await db
    .prepare(`SELECT id, city_id AS cityId, name, norm_name AS norm, chain_id AS chainId FROM places WHERE id = ?`)
    .bind(placeId)
    .first<{ id: number; cityId: number; name: string; norm: string; chainId: number | null }>();
  if (!place || place.chainId) return place?.chainId ?? null;
  const mine = tokens(place.norm);

  const { results: chains } = await db
    .prepare(`SELECT id, norm_name AS norm FROM chains WHERE city_id = ? OR city_id IS NULL`)
    .bind(place.cityId)
    .all<{ id: number; norm: string }>();
  const existing = chains
    .filter((c) => place.norm === c.norm || place.norm.startsWith(`${c.norm} `))
    .sort((a, b) => b.norm.length - a.norm.length)[0];
  if (existing) {
    await db.prepare(`UPDATE places SET chain_id = ? WHERE id = ?`).bind(existing.id, place.id).run();
    return existing.id;
  }

  const { results: others } = await db
    .prepare(`SELECT id, norm_name AS norm, chain_id AS chainId FROM places WHERE city_id = ? AND id != ? AND status != 'hidden'`)
    .bind(place.cityId, place.id)
    .all<{ id: number; norm: string; chainId: number | null }>();
  let best: { prefix: string[]; ids: number[] } | null = null;
  for (const o of others) {
    const prefix = commonPrefix(mine, tokens(o.norm));
    if (!isBrand(prefix)) continue;
    if (!best || prefix.length > best.prefix.length) best = { prefix, ids: [o.id] };
    else if (prefix.length === best.prefix.length && prefix.join(' ') === best.prefix.join(' ')) best.ids.push(o.id);
  }
  if (!best) return null;

  const norm = best.prefix.join(' ');
  const name = displayPrefix(place.name, best.prefix.length);
  await db
    .prepare(`INSERT OR IGNORE INTO chains (city_id, name, slug, norm_name) VALUES (?, ?, ?, ?)`)
    .bind(place.cityId, name, norm.replace(/\s+/g, '-'), norm)
    .run();
  const chain = await db.prepare(`SELECT id FROM chains WHERE city_id = ? AND norm_name = ?`).bind(place.cityId, norm).first<{ id: number }>();
  const ids = [place.id, ...best.ids];
  await db.batch(ids.map((id) => db.prepare(`UPDATE places SET chain_id = ? WHERE id = ? AND chain_id IS NULL`).bind(chain!.id, id)));
  return chain!.id;
}

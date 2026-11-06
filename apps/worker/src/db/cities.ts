export interface CityRow {
  id: number;
  slug: string;
  name: string;
  nameEn: string | null;
  centerLat: number;
  centerLng: number;
  zoom: number;
  bbox: [number, number, number, number];
  active: boolean;
}

const SELECT = `SELECT id, slug, name, name_en AS nameEn, center_lat AS centerLat, center_lng AS centerLng,
  zoom, bbox_json AS bboxJson, active FROM cities`;

type Raw = Omit<CityRow, 'bbox' | 'active'> & { bboxJson: string; active: number };
const map = (r: Raw): CityRow => {
  const { bboxJson, active, ...rest } = r;
  return { ...rest, bbox: JSON.parse(bboxJson), active: active === 1 };
};

export async function listCities(db: D1Database): Promise<CityRow[]> {
  const { results } = await db.prepare(`${SELECT} WHERE active = 1 ORDER BY id`).all<Raw>();
  return results.map(map);
}

export async function getCityBySlug(db: D1Database, slug: string): Promise<CityRow | null> {
  const r = await db.prepare(`${SELECT} WHERE slug = ?`).bind(slug).first<Raw>();
  return r ? map(r) : null;
}

export async function getCityById(db: D1Database, id: number): Promise<CityRow | null> {
  const r = await db.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Raw>();
  return r ? map(r) : null;
}

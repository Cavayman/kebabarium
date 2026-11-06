import type { Lang, Me } from '@kebabarium/shared';

export interface UserRow {
  id: number;
  googleSub: string;
  email: string;
  nickname: string | null;
  firstName: string | null;
  lastName: string | null;
  showRealName: boolean;
  hideFromLeaderboard: boolean;
  avatarUrl: string | null;
  lang: Lang | null;
  role: 'user' | 'admin';
}

const SELECT = `SELECT id, google_sub AS googleSub, email, nickname, first_name AS firstName, last_name AS lastName,
  show_real_name AS showRealName, hide_from_leaderboard AS hideFromLeaderboard, avatar_url AS avatarUrl, lang, role FROM users`;
type Raw = Omit<UserRow, 'showRealName' | 'hideFromLeaderboard'> & { showRealName: number; hideFromLeaderboard: number };
const map = (r: Raw): UserRow => ({ ...r, showRealName: r.showRealName === 1, hideFromLeaderboard: r.hideFromLeaderboard === 1 });

export async function getUserById(db: D1Database, id: number): Promise<UserRow | null> {
  const r = await db.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Raw>();
  return r ? map(r) : null;
}

export interface GoogleUpsert {
  sub: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: 'user' | 'admin';
}

/** Creates or refreshes the user for a Google account; role is recomputed on every login. */
export async function upsertGoogleUser(db: D1Database, u: GoogleUpsert): Promise<UserRow> {
  const r = await db
    .prepare(
      `INSERT INTO users (google_sub, email, first_name, last_name, avatar_url, role) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email, first_name = excluded.first_name,
         last_name = excluded.last_name, avatar_url = excluded.avatar_url, role = excluded.role
       RETURNING id`,
    )
    .bind(u.sub, u.email, u.firstName, u.lastName, u.avatarUrl, u.role)
    .first<{ id: number }>();
  return (await getUserById(db, r!.id))!;
}

export async function isNicknameTaken(db: D1Database, nickname: string, exceptUserId?: number): Promise<boolean> {
  const r = await db
    .prepare(`SELECT id FROM users WHERE nickname_lc = ? AND id != ?`)
    .bind(nickname.toLowerCase(), exceptUserId ?? -1)
    .first();
  return r != null;
}

export interface ProfilePatch {
  nickname?: string;
  showRealName?: boolean;
  hideFromLeaderboard?: boolean;
  lang?: Lang;
}

export async function updateProfile(db: D1Database, id: number, p: ProfilePatch): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (p.nickname !== undefined) {
    sets.push('nickname = ?', 'nickname_lc = ?');
    args.push(p.nickname, p.nickname.toLowerCase());
  }
  if (p.showRealName !== undefined) {
    sets.push('show_real_name = ?');
    args.push(p.showRealName ? 1 : 0);
  }
  if (p.hideFromLeaderboard !== undefined) {
    sets.push('hide_from_leaderboard = ?');
    args.push(p.hideFromLeaderboard ? 1 : 0);
  }
  if (p.lang !== undefined) {
    sets.push('lang = ?');
    args.push(p.lang);
  }
  if (!sets.length) return;
  await db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).bind(...args, id).run();
}

export function toMe(u: UserRow): Me {
  const real = [u.firstName, u.lastName].filter(Boolean).join(' ');
  return {
    id: u.id,
    nickname: u.nickname,
    displayName: (u.showRealName && real) || u.nickname || u.firstName || 'анонім',
    firstName: u.firstName,
    lastName: u.lastName,
    avatarUrl: u.avatarUrl,
    role: u.role,
    showRealName: u.showRealName,
    hideFromLeaderboard: u.hideFromLeaderboard,
    lang: u.lang,
  };
}

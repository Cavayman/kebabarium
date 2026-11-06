-- Kebabarium initial schema (spec §7). Timestamps are ISO-8601 UTC strings.

CREATE TABLE cities (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  zoom REAL NOT NULL DEFAULT 12.4,
  bbox_json TEXT NOT NULL,            -- [minLng, minLat, maxLng, maxLat]
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE chains (
  id INTEGER PRIMARY KEY,
  city_id INTEGER REFERENCES cities(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  norm_name TEXT NOT NULL,
  logo_url TEXT,
  UNIQUE (city_id, norm_name)
);

CREATE TABLE places (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  google_place_id TEXT UNIQUE,
  name TEXT NOT NULL,
  norm_name TEXT NOT NULL,
  address TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  district TEXT,
  chain_id INTEGER REFERENCES chains(id),
  logo_url TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed_temp', 'dead', 'hidden')),
  dead_reason TEXT,
  dead_candidate INTEGER NOT NULL DEFAULT 0,
  moved_to_place_id INTEGER REFERENCES places(id),
  google_rating REAL,
  google_rating_count INTEGER,
  google_last_synced_at TEXT,
  discovered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX places_city_status ON places (city_id, status);
CREATE INDEX places_chain ON places (chain_id);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  nickname TEXT,
  nickname_lc TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  show_real_name INTEGER NOT NULL DEFAULT 0,
  hide_from_leaderboard INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT,
  lang TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE ratings (
  id INTEGER PRIMARY KEY,
  place_id INTEGER NOT NULL REFERENCES places(id),
  user_id INTEGER REFERENCES users(id),
  nickname TEXT,
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
  text TEXT,
  is_anonymous INTEGER NOT NULL,
  weight REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'published', 'held', 'hidden')),
  hold_reasons TEXT,
  publish_at TEXT,
  ip_hash TEXT,
  ip_prefix_hash TEXT,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX ratings_user_place ON ratings (place_id, user_id) WHERE user_id IS NOT NULL AND status != 'hidden';
CREATE INDEX ratings_place_status ON ratings (place_id, status);
CREATE INDEX ratings_ip ON ratings (ip_hash, created_at);
CREATE INDEX ratings_ip_prefix ON ratings (ip_prefix_hash, created_at);
CREATE INDEX ratings_device ON ratings (device_id, created_at);
CREATE INDEX ratings_status_publish ON ratings (status, publish_at);
CREATE INDEX ratings_created ON ratings (created_at);

CREATE TABLE rating_history (
  id INTEGER PRIMARY KEY,
  rating_id INTEGER NOT NULL REFERENCES ratings(id),
  stars INTEGER NOT NULL,
  text TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE external_reviews (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  place_id INTEGER REFERENCES places(id),
  source TEXT NOT NULL CHECK (source IN ('google', 'threads')),
  external_id TEXT NOT NULL,
  author TEXT,
  author_url TEXT,
  text TEXT,
  stars INTEGER,
  url TEXT,
  published_at TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (source, external_id)
);
CREATE INDEX external_place ON external_reviews (place_id, published_at);
CREATE INDEX external_city ON external_reviews (city_id, published_at);

CREATE TABLE abuse_bans (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ip_prefix', 'device', 'user')),
  value_hash TEXT NOT NULL,
  reason TEXT,
  until TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX abuse_bans_value ON abuse_bans (kind, value_hash);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  calls_used INTEGER NOT NULL DEFAULT 0,
  places_added INTEGER NOT NULL DEFAULT 0,
  places_updated INTEGER NOT NULL DEFAULT 0,
  marked_dead INTEGER NOT NULL DEFAULT 0,
  external_added INTEGER NOT NULL DEFAULT 0,
  threads_status TEXT,
  error TEXT
);

CREATE TABLE budget_usage (
  month TEXT NOT NULL,
  sku TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (month, sku)
);

CREATE TABLE sync_cursor (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Real data needed in production: the launch city.
INSERT INTO cities (id, slug, name, name_en, center_lat, center_lng, zoom, bbox_json, active)
VALUES (1, 'lviv', 'Львів', 'Lviv', 49.832, 24.022, 12.4, '[23.90,49.76,24.13,49.90]', 1);

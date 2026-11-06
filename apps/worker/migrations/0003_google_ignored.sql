-- Google places discovery looked at and rejected (closed for good, no name, outside the city).
-- Remembered so their paid details are never fetched twice.
CREATE TABLE google_ignored (
  google_place_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

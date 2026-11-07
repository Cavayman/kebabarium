-- Per-city chat room. Only signed-in users write; everyone reads. Admins hide instead of deleting.
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX chat_city ON chat_messages (city_id, status, id);
CREATE INDEX chat_user ON chat_messages (user_id, created_at);

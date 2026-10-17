PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  visitor_id TEXT, session_id TEXT, user_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('client','server')),
  url TEXT, path TEXT, referrer TEXT,
  user_agent TEXT, ip_hash TEXT,
  properties TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_name_ts    ON events(name, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_visitor_ts ON events(visitor_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_events_path_ts    ON events(path, timestamp);
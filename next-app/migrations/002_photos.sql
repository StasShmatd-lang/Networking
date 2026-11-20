-- Guest photos live outside the event JSON so the event stays small
-- no matter how many guests join (600+ guests ≈ a few hundred KB of JSON).
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS photos_event_id_idx ON photos (event_id);

-- Snapshot of track IDs in the LD master Spotify playlist (refreshed on sync).

CREATE TABLE IF NOT EXISTS spotify_ld_master_track_ids (
  spotify_track_id text PRIMARY KEY,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spotify_ld_master_track_ids ENABLE ROW LEVEL SECURITY;

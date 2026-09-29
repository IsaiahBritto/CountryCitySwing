-- Per-competition playlist maker config and last generated Spotify playlist metadata.

CREATE TABLE IF NOT EXISTS comp_playlist_configs (
  competition_id uuid PRIMARY KEY REFERENCES competitions (id) ON DELETE CASCADE,
  allowed_playlist_ids text[] NOT NULL DEFAULT '{}'::text[],
  excluded_playlist_ids text[] NOT NULL DEFAULT '{}'::text[],
  rounds jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_spotify_playlist_id text,
  last_spotify_playlist_url text,
  last_generated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only: RLS blocks anon/authenticated; service role bypasses RLS.
ALTER TABLE comp_playlist_configs ENABLE ROW LEVEL SECURITY;

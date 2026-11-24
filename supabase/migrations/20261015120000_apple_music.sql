-- Apple Music caches and track_audio_analysis extension (additive)

alter table if exists track_audio_analysis
  add column if not exists apple_music_catalog_id text;

create index if not exists track_audio_analysis_apple_music_catalog_id_idx
  on track_audio_analysis (apple_music_catalog_id)
  where apple_music_catalog_id is not null;

-- Social / active playlist provider columns (dual-run during migration)
alter table if exists social_active_playlist
  add column if not exists music_provider text default 'spotify',
  add column if not exists apple_music_playlist_id text;

alter table if exists social_playlist_tracks
  add column if not exists music_provider text default 'spotify',
  add column if not exists catalog_track_id text;

alter table if exists social_song_requests
  add column if not exists music_provider text default 'spotify',
  add column if not exists catalog_track_id text;

-- Server-only tables: Next.js uses SB_SERVICE_ROLE_KEY (bypasses RLS). No client policies.
create table if not exists apple_music_owned_playlists_cache (
  id text primary key default 'default',
  apple_user_hash text not null,
  playlists jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
alter table public.apple_music_owned_playlists_cache enable row level security;

create table if not exists apple_music_playlist_tracks_cache (
  playlist_id text primary key,
  tracks jsonb not null default '[]'::jsonb,
  total_duration_ms bigint not null default 0,
  fetched_at timestamptz not null default now()
);
alter table public.apple_music_playlist_tracks_cache enable row level security;

create table if not exists apple_music_session_credentials (
  id text primary key default 'default',
  music_user_token text not null,
  storefront_id text,
  updated_at timestamptz not null default now()
);
alter table public.apple_music_session_credentials enable row level security;

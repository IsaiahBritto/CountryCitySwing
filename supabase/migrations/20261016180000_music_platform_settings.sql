-- Singleton music platform provider (Spotify vs Apple Music) for admin UI toggle.
create table if not exists public.music_platform_settings (
  id text primary key default 'default',
  provider text not null default 'spotify'
    check (provider in ('spotify', 'apple_music')),
  updated_at timestamptz not null default now(),
  updated_by uuid null
);

insert into public.music_platform_settings (id, provider)
values ('default', 'spotify')
on conflict (id) do nothing;

alter table public.music_platform_settings enable row level security;

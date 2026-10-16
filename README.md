# Country City Swing Website

A full-featured, responsive Next.js website for **Country City Swing**, built with:
- Next.js 15 (App Router + TypeScript)
- Tailwind CSS
- next-themes (dark/light mode)
- Nodemailer (prayer request form)
- Google Drive API (media gallery)
- Deployed on Vercel
- Apple Music (MusicKit) for DJ deck, social playlists, and admin music tools (default)
- Musicae (RapidAPI) for ISRC-keyed BPM/key analysis cache

### Apple Music setup

See [docs/apple-music-setup.md](docs/apple-music-setup.md) for Developer Program / MusicKit keys and Vercel env vars (`APPLE_MUSIC_*`). Default provider is `apple_music` (`MUSIC_PROVIDER` / `NEXT_PUBLIC_MUSIC_PROVIDER`). DJ deck: `/apple-music/deck` (also `/spotify/deck`).

---

## 🚀 Getting Started

### 1️⃣ Clone & Install
```bash
git clone <your-repo-url> country-city-swing
cd country-city-swing
npm install

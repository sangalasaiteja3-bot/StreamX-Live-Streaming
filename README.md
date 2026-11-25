# StreamX — Live Streaming Web Application

StreamX is a responsive browser-based live-streaming community app connected to a hosted Supabase backend.

## Run locally
1. Clone or download this repository and open it in VS Code.
2. Run `python -m http.server 5500` from the project folder.
3. Open http://localhost:5500.

Do not open `index.html` directly as a file; use localhost so browser ES modules and camera permissions work.

## Features connected to Supabase
- Email/password sign-up and sign-in using Supabase Auth
- Creator profile read/update
- Live stream creation, listing, ending and realtime feed updates
- Follow/unfollow creators
- Like records with duplicate-like protection
- Persistent chat messages with Realtime updates
- Private notification reads

The homepage now loads live streams from Postgres rather than showing hard-coded sample streams. Users must sign in for actions that write data.

## Backend project
[Open StreamX Supabase Dashboard](https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb)  
Region: Mumbai (`ap-south-1`)

Tables: `profiles`, `streams`, `follows`, `stream_messages`, `stream_likes`, `notifications`. RLS is enabled on all exposed tables. Realtime is enabled for streams and chat. Storage buckets `streamx-avatars` and `streamx-thumbnails` are configured.

## Backend test dashboard
Open http://localhost:5500/backend-demo.html to test Supabase Auth and database actions separately.

## Important live-video limitation
Supabase stores accounts, profiles, stream metadata, follows, likes and chat. The browser camera preview is local to the creator's device. The current app creates a live stream record and syncs it to other browsers, but **it does not transmit audio/video to viewers**. Actual multi-viewer broadcasting requires WebRTC signaling and a media server/TURN infrastructure or a dedicated streaming provider.

## Security
The browser contains only a Supabase publishable key. Never add a service-role key, secret API key, or database password to frontend files or GitHub.

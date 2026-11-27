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
- Screen + webcam picture-in-picture recording with microphone audio; uploaded to private Supabase Storage when the creator ends the stream
- My Recordings library with in-page playback and download links
- Resumable TUS uploads for video files larger than 6 MB

The homepage now loads live streams from Postgres rather than showing hard-coded sample streams. Users must sign in for actions that write data. Recordings are limited to 50 MB per stream.

## Backend project
[Open StreamX Supabase Dashboard](https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb)  
Region: Mumbai (`ap-south-1`)

Tables: `profiles`, `streams`, `follows`, `stream_messages`, `stream_likes`, `notifications`, and `stream_recordings`. RLS is enabled on exposed tables. Realtime is enabled for streams and chat. Storage buckets include `streamx-avatars`, `streamx-thumbnails`, and the private `streamx-recordings` bucket.

## Backend test dashboard
Open http://localhost:5500/backend-demo.html to test Supabase Auth and database actions separately.

## Important live-video limitation
Supabase stores accounts, profiles, stream metadata, follows, likes, chat, and private video recordings. When a creator ends a stream, StreamX uploads the creator's local camera/microphone recording to the private Storage bucket. The current app creates a live stream record and syncs it to other browsers, but **it does not transmit the live audio/video feed to viewers**. For recordings, creators can share a screen/tab/window and StreamX records that with a webcam picture-in-picture overlay plus microphone audio. Actual multi-viewer broadcasting requires WebRTC signaling and a media server/TURN infrastructure or a dedicated streaming provider.

## Security
The browser contains only a Supabase publishable key. Never add a service-role key, secret API key, or database password to frontend files or GitHub.

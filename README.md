# StreamX — Live Streaming Web Application

StreamX is a browser-based live-streaming community demo with a dark responsive interface and a Supabase backend.

## Repository contents
The complete source project is available in **[StreamX_Supabase_Backend_Integrated.zip](./StreamX_Supabase_Backend_Integrated.zip)**. Extract it to get:
- `index.html`, `style.css`, `script.js` — main StreamX website
- `backend-demo.html` — Supabase integration test dashboard
- `backend/supabase-client.js` — Supabase browser client (publishable key only)
- `backend/streamx-api.js` — authentication, profiles, streams, follows, likes, chat and notifications
- `README_BACKEND.md` — setup instructions and backend notes

## Supabase backend
Project: [StreamX Supabase Dashboard](https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb)  
Region: Mumbai (ap-south-1)

Tables configured: `profiles`, `streams`, `follows`, `stream_messages`, `stream_likes`, `notifications`. Row Level Security is enabled. Realtime is enabled for streams and chat. Storage buckets: `streamx-avatars` and `streamx-thumbnails`.

## Run locally
1. Download and extract the ZIP.
2. Open the extracted `StreamX_Full_Demo` folder in VS Code.
3. Open a terminal in that folder and run:
   ```bash
   python -m http.server 5500
   ```
4. Open http://localhost:5500

For the backend test page, open http://localhost:5500/backend-demo.html.

## Important video note
Supabase stores user accounts, stream metadata, follows, likes, chat and notifications. The camera preview in the demo is local to the creator's browser. Real multi-viewer live video needs WebRTC signaling/media infrastructure or a dedicated streaming provider; Supabase itself is not a video relay server.

## Security
The frontend contains only a Supabase publishable key. Never add a service-role key, secret API key, or database password to browser code or this repository.

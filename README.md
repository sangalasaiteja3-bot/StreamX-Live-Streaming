# StreamX — Live Streaming Web Application

StreamX is a responsive browser-based live-streaming community project with an interactive frontend and a Supabase backend.

## Open the project
- Main website: [index.html](./index.html)
- Supabase backend test dashboard: [backend-demo.html](./backend-demo.html)
- Backend setup notes: [README_BACKEND.md](./README_BACKEND.md)

## Project structure
```
.
├── index.html
├── style.css
├── script.js
├── backend-demo.html
├── backend/
│   ├── backend-demo.js
│   ├── streamx-api.js
│   └── supabase-client.js
├── supabase/
│   └── README.md
└── README_BACKEND.md
```

## Supabase backend
Project: [StreamX Supabase Dashboard](https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb)  
Region: Mumbai (`ap-south-1`)

The Supabase project includes these tables:
- `profiles` — creator/user profiles
- `streams` — stream metadata and status
- `follows` — follower relationships
- `stream_messages` — persisted chat messages
- `stream_likes` — stream likes
- `notifications` — private notifications

Row Level Security is enabled on the public tables. Realtime is enabled for streams and chat. Storage buckets `streamx-avatars` and `streamx-thumbnails` are configured.

The browser client uses a Supabase **publishable** key. Never put a service-role key or database password in frontend code.

## Run locally in VS Code
1. Clone or download this repository.
2. Open the repository folder in VS Code.
3. Run this command in the terminal:
   ```bash
   python -m http.server 5500
   ```
4. Open http://localhost:5500.
5. Open http://localhost:5500/backend-demo.html to test Supabase signup/login, profiles, stream records, follows, likes, chat and notifications.

## Current implementation notes
The main `index.html` page is an interactive frontend demonstration. Its search/filter, profile, follow/like and chat interactions use browser local storage/session state. The separate `backend-demo.html` page exercises the connected Supabase backend through `backend/streamx-api.js`.

The creator camera preview is local to that browser. Real multi-viewer live audio/video needs WebRTC signaling/media infrastructure or a dedicated streaming provider. Supabase stores the stream metadata and chat, but is not itself a video relay server.

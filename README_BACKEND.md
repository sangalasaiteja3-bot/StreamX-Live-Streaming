# StreamX backend setup

## Supabase project
- Project: StreamX
- Region: Mumbai, India (`ap-south-1`)
- Project reference: `pzuxtlgadeqzzkghkyqb`
- Dashboard: https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb
- Project URL: https://pzuxtlgadeqzzkghkyqb.supabase.co

The browser client is configured in `backend/supabase-client.js` with the project's publishable key. Publishable keys are intended for frontend use. Never add a service-role or secret key to browser files or GitHub.

## Database objects
- `profiles` — creator/user profiles, automatically created after signup
- `streams` — stream title, category, status and creator
- `follows` — follower relationships
- `stream_messages` — persistent chat messages
- `stream_likes` — one like per user per stream
- `notifications` — private user notifications

RLS is enabled on every public table. Realtime database changes are enabled for `streams` and `stream_messages`. Storage buckets: `streamx-avatars` and `streamx-thumbnails`.

## Run it in VS Code
1. Open this repository folder in VS Code.
2. Run `python -m http.server 5500` in the terminal.
3. Open http://localhost:5500 for the main site.
4. Open http://localhost:5500/backend-demo.html to test the Supabase auth/database functions.
5. Create an account and confirm your email if confirmation is enabled.

## Important video note
The database, authentication, CRUD API layer, and chat persistence/realtime subscription are set up. The camera preview in the main website is local to the creator's browser. Real multi-viewer live video requires WebRTC signaling/media infrastructure or a dedicated streaming provider; Supabase stores stream metadata and chat but does not relay live video.

## Security
Only the publishable key is present in the frontend. Do not commit any service-role key, database password, or other secret to GitHub.

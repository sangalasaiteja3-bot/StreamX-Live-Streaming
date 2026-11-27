# StreamX backend

## Hosted Supabase
- Project: StreamX
- Region: Mumbai (`ap-south-1`)
- Project ref: `pzuxtlgadeqzzkghkyqb`
- Dashboard: https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb
- API URL: https://pzuxtlgadeqzzkghkyqb.supabase.co

The website imports the shared client from `backend/supabase-client.js` and database functions from `backend/streamx-api.js`.

## Main app integrations
| App action | Supabase resource |
|---|---|
| Sign up / sign in / sign out | Supabase Auth |
| Load and edit profile | `profiles` |
| Create, list and end streams | `streams` |
| Live feed refresh | Realtime changes on `streams` |
| Follow / unfollow | `follows` |
| Like a stream | `stream_likes` |
| Load/send chat | `stream_messages` |
| Live chat updates | Realtime changes on `stream_messages` |
| Notifications | `notifications` |
| Saved video recordings | `stream_recordings` and private Storage bucket `streamx-recordings` |

The profile trigger creates a `profiles` row after a new Auth user is created. All seven exposed public tables have Row Level Security enabled, and the project policies restrict writes to authenticated owners/users.

## Run in VS Code
1. Open the project folder.
2. Run `python -m http.server 5500`.
3. Visit http://localhost:5500.
4. Use **Sign in / Sign up** in the top-right corner.
5. Open Creator Studio, enable camera/microphone, and click Go Live to create a Supabase stream record.
6. Open the stream card to read and send persistent realtime chat messages.

Use http://localhost:5500/backend-demo.html for a separate backend test dashboard.

## Email confirmation
Hosted Supabase projects commonly require email verification by default. After sign-up, check your email, confirm the address, return to the local app, and sign in. Passwords are handled by Supabase Auth, not stored in the StreamX tables.

## Video architecture limitation
The app currently creates and syncs stream metadata and chat, but camera preview is local only. To make viewers receive a live audiovisual feed, add WebRTC signaling plus STUN/TURN and a Selective Forwarding Unit (SFU), or integrate a managed streaming provider. Do not describe the current Supabase-only build as full video broadcasting.

## Security
The browser uses a Supabase publishable key only. Never commit a service-role or secret key, database password, or private token.


## Saved live recordings
- StreamX records the creator's local camera and microphone feed with the browser `MediaRecorder` API when **Go Live** is clicked.
- When the creator ends the stream, the browser uploads the WebM/MP4 file to the private `streamx-recordings` Supabase Storage bucket.
- Recording metadata is stored in `stream_recordings`. Open **My Recordings** in the app to watch or download files.
- Files are private: authenticated users can upload, read, and delete only objects in their own user-ID folder. Signed watch/download links expire after one hour.
- Individual recordings are limited to 50 MB. Files up to 6 MB use the standard Storage upload; larger files use Supabase's TUS resumable upload flow in 6 MB chunks. Upload time depends on recording size and network speed.
- This feature saves the creator's local camera/microphone feed; it does not make the camera feed visible to other viewers. Multi-viewer live broadcasting still requires a WebRTC/SFU or managed streaming service.

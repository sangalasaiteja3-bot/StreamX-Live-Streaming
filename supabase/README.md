# Supabase database

The live database schema has already been applied to the StreamX Supabase project. Open the project dashboard and use **SQL Editor** or **Table Editor** to inspect the tables.

- `profiles`: user/creator profiles, automatically created after signup
- `streams`: stream metadata and status
- `follows`: creator follow relationships
- `stream_messages`: stored chat messages
- `stream_likes`: one like per user per stream
- `notifications`: private user notifications

RLS is enabled on all six tables. Realtime publication includes `streams` and `stream_messages`. Public storage buckets: `streamx-avatars` and `streamx-thumbnails`.

Dashboard: https://supabase.com/dashboard/project/pzuxtlgadeqzzkghkyqb

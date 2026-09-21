# Gas Car's Supabase

Gas Car's is temporarily using an existing Supabase project while the client forms the company and creates production infrastructure.

To prevent collisions with unrelated data in that project, every Gas Car's table and database function is prefixed with `gascars_`.

The migration files in this folder are the source of truth for the Gas Car's schema. When a dedicated production Supabase project is created, apply these migrations there instead of copying tables manually.

## Edge Function secrets

The automotive discovery map calls Google Places through the `gascars-places` Edge Function so the server credential is never bundled into the mobile app.

Production requires this Supabase Edge Function secret:

- `GOOGLE_PLACES_API_KEY` — server key restricted to Places API (New).

Do not add the server key to `.env`, `app.json`, or any `EXPO_PUBLIC_*` variable.

The native Google map itself uses platform-restricted keys from:

- `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY`
- `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`

Those are injected by `app.config.js` when creating development/production builds.

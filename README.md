# Gas Car's — Expo mobile app

Initial production-oriented foundation for Gas Car's using Expo + React Native + TypeScript + Expo Router.

## Current foundation

- One universal codebase for iOS, Android and web
- Gas Car's visual system and DFW demo experience
- Explore, Request, Garage and Profile tabs
- Business Portal foundation
- Supabase client scaffold with persistent auth storage
- Gas Car's database tables isolated with the `gascars_` prefix
- Row Level Security for driver, business and lead data
- Environment placeholders for Supabase and Google Maps
- App identifiers prepared as `com.gascars.app` (can be changed before store release)

## Start locally

1. Install Node.js 22.13+.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Add the temporary Supabase project URL and publishable key to `.env`.
5. Run `npx expo start`.
6. Open with a development build, Expo Go where compatible, or an emulator/simulator.

## Database

The temporary shared Supabase project may contain unrelated tables, so all Gas Car's tables use the `gascars_` prefix. Do not modify non-Gas-Car's tables from this app.

Lead contact details are stored separately from lead summaries. Businesses should only gain access to contact data after an unlock has been confirmed server-side.

## Next technical steps

1. Add authentication screens and role-aware sessions: Driver, Business, Admin.
2. Connect Garage to real vehicles in Supabase.
3. Connect Request to real leads and protected contact details.
4. Replace the demo map with production map/location integration.
5. Add Stripe in test mode for lead unlocks.
6. Add API usage controls before enabling paid fuel-price searches.
7. Move all credentials and infrastructure to the client's production accounts before launch.

Never commit private keys, service-role keys, payment secrets or unrestricted API credentials to GitHub.

# Gas Car's Supabase

Gas Car's is temporarily using an existing Supabase project while the client forms the company and creates production infrastructure.

To prevent collisions with unrelated data in that project, every Gas Car's table and database function is prefixed with `gascars_`.

The migration files in this folder are the source of truth for the Gas Car's schema. When a dedicated production Supabase project is created, apply these migrations there instead of copying tables manually.

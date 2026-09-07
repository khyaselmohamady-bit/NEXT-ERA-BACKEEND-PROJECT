# `.env.example`

Template for the local environment file. Copy it to `.env.local` (already in `.gitignore`, so real values never get committed) and fill in the team's actual Supabase project values.

## Variables
- **`NEXT_PUBLIC_SUPABASE_URL`** — the Supabase project's API URL.
- **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** — the project's publishable (anon) key.

Both are prefixed `NEXT_PUBLIC_`, which in Next.js means they're intentionally exposed to browser-side code, not just the server. That's fine here specifically because they're the *publishable* key — designed to be public — not a service-role secret. If a future route needs elevated database access, that key should go in a separate, non-`NEXT_PUBLIC_` variable so it's never bundled into client-side code.

These two variables are read by `src/lib/supabase/client.ts` via `getSupabaseClient()`; nothing else in the codebase currently touches them.

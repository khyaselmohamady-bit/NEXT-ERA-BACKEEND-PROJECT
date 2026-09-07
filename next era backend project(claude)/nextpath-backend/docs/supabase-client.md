# `src/lib/supabase/client.ts` — new file

A small helper that actually uses the Supabase env vars declared in `.env.example`. Before this file existed, `@supabase/supabase-js` was listed as a dependency and the env vars were documented, but nothing in the codebase read them.

## Beginner summary

Supabase is the service that gives NEXTPATH a database and user accounts. This file creates the object that lets backend code communicate with Supabase.

It checks the project address and publishable key first, then creates one reusable client. It never contains a real secret. If the settings are missing, it stops early with a useful message instead of failing later in a confusing database call.

## `requireEnv(name)`
Reads one of the two expected env vars (`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and throws a clear, actionable error if it's missing — pointing back at `.env.example` — instead of letting `createClient` fail later with a confusing message deep inside a request handler.

## `getSupabaseConfig()` and the `SupabaseConfig` type
Exposed so other modules — notably `src/lib/auth/getCurrentUser.ts`, which builds a per-request authenticated Supabase client for each inbound API request — can read the project's URL and publishable key without re-implementing the env-var lookup. Returns `{ url, publishableKey }` and throws the same "copy .env.example" error as `requireEnv` if either var is missing.

## `getSupabaseClient()`
Lazily creates a single Supabase client the first time it's called and caches it in module scope (`cachedClient`), so route handlers that call this repeatedly don't re-read env vars or re-create a client on every request. Reads the URL/key through `getSupabaseConfig()` rather than its own private env lookups, so a future rename or validation only has to happen in one place.

Deliberately uses only the **publishable (anon) key**, matching what `.env.example` documents — never a service-role secret. Any handler that needs elevated database access should get a separate, explicitly-named helper rather than extending this one, so it stays obvious from the import alone which privilege level a given route is using.

This file isn't wired into any route yet — the two current endpoints (`/api/health`, `/api/eligibility/evaluate`) don't need database access, and the new `getCurrentUser` helper uses it only to read config (it builds its own per-request client). It's here so the next route that needs Supabase (auth, storing a student profile, reading opportunity data, etc.) has a ready-made, correctly-scoped client to import instead of writing its own `createClient` call inline.

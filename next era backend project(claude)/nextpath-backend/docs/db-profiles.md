# `src/lib/db/profiles.ts` — new file

Repository functions for reading and writing rows in the `profiles` table (schema in `docs/db-schema.md`). This is the first code in the project that actually persists an `EligibilityProfile` — until now every profile had to be hand-carried in an API request body.

## Beginner summary

This file is the backend’s **profile filing clerk**. Other code should not write SQL-shaped names such as `nationality_code` everywhere. Instead, it asks this file to load or save a normal TypeScript profile with names such as `nationalityCode`.

The two actions are simple:

- `getProfileById` asks, “does this student already have a profile?”
- `upsertProfile` says, “save this profile whether it is new or already exists.”

## `ProfileRow` and `rowToProfile`
`ProfileRow` describes the raw snake_case shape Postgres returns. `rowToProfile` converts it to the camelCase `EligibilityProfile` type the eligibility engine already expects, translating a `null` database column to `undefined` (matching how `EligibilityProfile`'s fields are all optional, not nullable). Keeping this mapping in one function means no caller has to know or care about column-naming conventions.

## `getProfileById(userId, client?)`
Looks up one profile by its id (which is also the Supabase Auth user id) using `.maybeSingle()` rather than `.single()` — deliberately, since "this student hasn't filled out a profile yet" is an expected, normal case (returns `null`), not an error. A genuine Supabase error (network failure, RLS rejection, etc.) still throws, with the underlying message wrapped in more context.

## `upsertProfile(userId, profile, client?)`
Writes a profile with `upsert`, not separate `insert`/`update` calls, so the caller never has to check in advance whether a row already exists — the first time a student fills out their profile and every time they edit it afterward call the same function. Any field the caller didn't provide is written as `null` explicitly (not left out of the query), so clearing a previously-set field works the same way as setting one.

## The `client` parameter
Every function takes an optional `client: SupabaseClient`, defaulting to `getSupabaseClient()` from `src/lib/supabase/client.ts`. In real usage nothing needs to pass it — the default kicks in. In tests, a mock client (see `docs/mock-supabase-client.md`) is passed explicitly, which is what makes `profiles.test.ts` able to run without a live Supabase project or credentials.

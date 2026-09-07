# `supabase/migrations/20260906120000_init_schema.sql` & `supabase/seed.sql` — new files

The database schema behind the repository layer in `src/lib/db/`.

## Beginner summary

Think of the database as a set of spreadsheets that only the backend can safely use. A **migration** is a saved instruction sheet that creates those spreadsheets in the same way for every teammate.

This project currently has two main tables:

```text
profiles      -> facts about one student
opportunities -> facts and hard rules for one opportunity
```

The database also has security rules called RLS. They are the last line of defence: even if an API route has a mistake, a student should still be unable to access another student's profile row.

## `profiles` table
One row per authenticated student, `id` is a foreign key to `auth.users(id)` so it's tied directly to a Supabase Auth account (`on delete cascade` — if the user is deleted, their profile goes with them). Every other column maps 1:1 to `EligibilityProfile` in `src/lib/eligibility/types.ts`: `nationality_code`, `birth_date`, `education_level` (constrained by a `check` to the same five values as the `EducationLevel` union), `academic_year`, `gpa`, `residency_country_code`, `has_required_legal_authorization`.

## `opportunities` table
One row per scholarship/opportunity. `title`, `organization`, and `source_url` are plain product fields. The interesting column is **`hard_requirements jsonb`**, which stores the *entire* `OpportunityHardRequirements` object as-is, rather than one column per rule. This is deliberate: each rule is a `Requirement<T>` discriminated union (`EXPLICIT` / `AMBIGUOUS` / `NOT_STATED`), which doesn't map cleanly onto flat relational columns without either a lot of nullable columns or a side table per rule. Storing it as JSONB means the database schema and the TypeScript type can never drift apart — whatever `evaluateEligibility` expects is exactly what's stored.

## `updated_at` trigger
`set_updated_at()` is a small trigger function attached to both tables so `updated_at` is maintained by Postgres itself on every `update`, instead of every write path in the application having to remember to set it.

## Row-level security
- **`profiles`** — three policies (`select`, `insert`, `update`) all check `auth.uid() = id`, so a student can only ever read or write their *own* profile row. There's no delete policy yet (not needed until account deletion is built).
- **`opportunities`** — one `select` policy open to everyone (`using (true)`), since opportunity listings are meant to be public. There's intentionally **no insert/update policy** yet — until an admin role exists (a later increment), writing opportunities has to go through a service-role client, which bypasses RLS entirely. `createOpportunity()` in `src/lib/db/opportunities.ts` is written to accept any `SupabaseClient`, specifically so it can be called with a service-role client without any code changes once that's wired up.

## `seed.sql`
Three sample opportunities for local development and demos, matching the fixture style used in `evaluate.test.ts`:
1. **STEM Excellence Scholarship** — fully `EXPLICIT` requirements; the same student fixture that passes the engine's tests will show as `ELIGIBLE` against this row.
2. **Global Graduate Fellowship** — mostly `NOT_STATED`/`AMBIGUOUS`, useful for demoing the `LIKELY_ELIGIBLE`/`UNKNOWN` paths against real data instead of only in unit tests.
3. **Community College Bridge Grant** — a stricter example using an age *ceiling* only (no minimum) and a different accepted-nationality list, to show the schema handles varied shapes of the same `Requirement<T>` union.

Run it locally with `supabase db reset` (applies migrations, then seed) or `psql < supabase/seed.sql` against a database that already has the migration applied.

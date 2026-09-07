# `src/lib/db/testing/mock-supabase-client.ts` — new file

A hand-written stand-in for Supabase's real query builder, used only by tests. It doesn't try to reimplement Postgrest — it covers exactly the chain of methods the repository functions in `src/lib/db` call: `from().select().eq().maybeSingle()`, `from().insert().select().single()`, `from().upsert()`, `from().select().order()`.

## Beginner summary

This is a **pretend Supabase client** used in tests. It lets a test ask, “what would this repository do?” without needing internet access, real student data, or a live database.

It also records the requested database actions. That means a test can check both the answer returned by a repository and whether it asked the correct table for the correct row.

## Why this exists
`profiles.ts` and `opportunities.ts` need integration-style tests, but there's no live Supabase project or credentials available in this environment (or in most CI setups) to test against. Real Postgrest query builders are chainable *and* directly awaitable — `await client.from("x").select("*")` works without ever calling a terminal method — so the mock implements a `.then()` on its builder object to support both styles.

## `createMockSupabaseClient(result)`
Takes one fixed `{ data, error }` result and returns an object that:
- Records every call (`from`, `select`, `eq`, `order`, `insert`, `upsert`, `single`, `maybeSingle`) into a `__calls` array, in order, with their arguments.
- Resolves to `result` regardless of which terminal method is called, or when awaited directly.

The returned object is cast to `MockSupabaseClient` (which extends the real `SupabaseClient` type plus `__calls`), so it satisfies every repository function's `client?: SupabaseClient` parameter without extra casting at call sites.

## How tests use it
Two things get verified per test, using the same mock:
1. **Behavior** — call a repository function with the mock, assert on what it returns (e.g. `getProfileById` returns `null` when `data` is `null`, or throws when `error` is set).
2. **Query shape** — inspect `client.__calls` to assert the function queried the right table with the right filters (e.g. `upsertProfile` actually calls `.upsert()` with the expected snake_case object, `listOpportunities` actually orders by `created_at` descending).

This intentionally stays a plain hand-rolled object rather than a mocking library (`vi.fn()` chains, `vitest-mock-extended`, etc.) — the chain Supabase exposes is small and stable enough that a ~50-line implementation is easier to read and modify than wiring up a general-purpose mocking tool for it.

# `src/app/api/saved/*` — saved opportunities

The §65 "SAVE" MVP item. Lets an authenticated student save an opportunity to a personal list, list their saved opportunities, and remove one.

## Beginner summary

Three operations on a per-student bookmark:

- **`GET /api/saved`** — list the authenticated student's saved opportunities (returns full `Opportunity` payloads so the demo can render the saved-list page without a second round-trip per card).
- **`POST /api/saved`** — body `{ opportunityId: <uuid> }`; saves the opportunity for the current student. Returns 201 on success, 409 if it's already saved, 400 if the opportunity doesn't exist, 401 if unauthenticated.
- **`DELETE /api/saved/:id`** — `:id` is the opportunity id; removes the save. Idempotent: 200 whether the row existed or not.

## Why one boolean row per (user, opportunity)

The §65 MVP is a single bookmark per opportunity. The full §37 state machine (`DISCOVERED → SAVED → PREPARING → …`) belongs to increment 9 (Applications + tracker). A second table here would mix two responsibilities (bookmark vs. tracker) and require a migration later to disentangle them.

## Schema

```sql
-- supabase/migrations/20260907110000_saved_opportunities.sql
create table public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
```

Three things matter:

1. **`unique (user_id, opportunity_id)`** — prevents the same save being recorded twice. The `POST` handler turns the resulting `23505` error into a clean 409.
2. **`on delete cascade`** — deleting a user or an opportunity cleans up saved rows automatically. No stale orphans.
3. **Three RLS policies** — `select`, `insert`, and `delete` are all gated on `auth.uid() = user_id`. No `update` policy because nothing on a saved row is mutable.

## Response shapes

Discriminated unions on `status` so the frontend uses one decoder per route:

```ts
// GET
{ status: "ok", items: SavedOpportunity[], count: number }
| { status: "unauthenticated", message: string }

// POST
{ status: "ok", saved: { savedId, savedAt, opportunityId } }    // 201
| { status: "unauthenticated", message: string }                 // 401
| { status: "invalid_opportunity", message: string, issues? }    // 400
| { status: "already_saved", message: string }                   // 409
| { status: "error", message: string }                           // 500

// DELETE
{ status: "ok", message: string }                                // 200
| { status: "unauthenticated", message: string }                 // 401
| { status: "error", message: string }                           // 500
```

`POST` returns the **minimal** `SavedRowOnly` shape (no joined opportunity) so the handler doesn't need a second database call after the insert. The list endpoint returns the full `SavedOpportunity` (with joined `Opportunity`) because the demo renders a saved-list page.

## Implementation notes

### Dependency injection

`listSavedByUser`, `saveOpportunity`, `unsaveOpportunity` all accept an optional `SupabaseClient` (defaulting to `getSupabaseClient()`). Tests inject the existing mock client from `src/lib/db/testing/mock-supabase-client.ts`, which now also stubs `delete` (added in this increment).

### Test-only auth seam

Both route files expose `__setTestAuthenticate`, the same module-level mutable seam as `src/app/api/profile/route.ts`. Production never touches it; tests reset it in `afterEach`.

### Error mapping

`POST` matches on the wrapped error message text rather than parsing Postgres error codes:
- `/duplicate key/i` → 409 `already_saved`
- `/foreign key/i` → 400 `invalid_opportunity`
- anything else → 500 `error`

This keeps the handler ignorant of the underlying Postgres version's exact error code phrasing.

## How its tests prove behaviour

`src/lib/db/saved.test.ts` (6 tests):

- `listSavedByUser` queries with `user_id` filter, orders by `saved_at` descending, returns empty when no rows, performs the per-row `getOpportunityById` join
- `saveOpportunity` inserts with `(user_id, opportunity_id)` and propagates unique-constraint errors
- `unsaveOpportunity` deletes with `user_id` and `opportunity_id` filters and propagates delete errors

`src/app/api/saved/route.test.ts` (10 tests):

- GET: 401 unauthenticated, 200 empty, 200 with `user_id` filter
- POST: 401, 400 invalid JSON, 400 empty body, 400 not-a-UUID, 400 invalid_opportunity (FK failure), 201 success, 409 duplicate, 500 other failure

`src/app/api/saved/[id]/route.test.ts` (4 tests):

- 401 unauthenticated, 200 happy delete with confirmation, query shape (`delete` + two `eq` filters), 500 on Supabase failure

`src/lib/db/testing/mock-supabase-client.ts` — `delete` added to the chainable method list so the new repo's `delete` calls are stubbed.

## How it connects to the rest of NEXTPATH

- **§65 MVP** — "SAVE" is now ✓.
- **§37 Application tracker** — increment 9 will own the full state machine. Saved rows here are a strict subset of an application's history (a saved opportunity could become a PREPARING application).
- **§49 API structure** — `/api/saved` (list, create), `/api/saved/:id` (delete) match the blueprint's tree.
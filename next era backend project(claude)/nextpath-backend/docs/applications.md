# Applications + state machine (`/api/applications/*`)

The §65 "APPLICATION TRACKER" MVP item. Lets an authenticated student create applications, walk them through the §37 state machine, and remove them.

## Beginner summary

Three operations on a per-student application record:

- **`GET /api/applications`** — list the authenticated student's applications with full Opportunity payloads joined.
- **`POST /api/applications`** — body `{ opportunityId, initialState? }`. Default initial state is `SAVED` so clicking a "track" button lands the student squarely in the tracker with a visible state. Returns 409 (`already_tracked`) when the student is already tracking the opportunity.
- **`PUT /api/applications/:id`** — body `{ state }`. Walks the §37 state machine. Returns 409 (`illegal_transition`) when the requested move isn't allowed (e.g. `DISCOVERED → SUBMITTED` skips `SAVED`/`PREPARING`/`READY`).
- **`DELETE /api/applications/:id`** — removes the application row. Idempotent.

## State machine

Pinned as a `TRANSITIONS` const in `src/lib/applications/stateMachine.ts`:

```
DISCOVERED -> SAVED
SAVED      -> PREPARING | DISCOVERED       (unsave)
PREPARING  -> READY | SAVED                (abandon prep)
READY      -> SUBMITTED | PREPARING       (found missing doc)
SUBMITTED  -> ACCEPTED | REJECTED
ACCEPTED   -> (terminal)
REJECTED   -> (terminal)
EXPIRED    -> (terminal)
```

`canTransition(from, to)` returns `true` only for moves listed above; `validNextStates(from)` returns the array of allowed destinations (empty for terminal states); `isTerminal(state)` is a convenience predicate.

## Schema

```sql
-- supabase/migrations/20260907120000_applications.sql
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  state text not null check (state in ('DISCOVERED','SAVED','PREPARING','READY','SUBMITTED','ACCEPTED','REJECTED','EXPIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);
```

Three constraints worth noting:

1. **`unique (user_id, opportunity_id)`** — enforces "one application per opportunity per student" at the database level. The `POST` handler turns the resulting `23505` error into a 409.
2. **`check` on `state`** — pins the column to the exact eight §37 values. Adding a new state requires both a database migration AND a deliberate change in `stateMachine.ts`.
3. **`on delete cascade`** — deleting a user or opportunity cleans up applications automatically.

Four RLS policies (`select`, `insert`, `update`, `delete`) gate every operation on `auth.uid() = user_id`. No row is mutable by anyone other than its owner.

## Response envelopes

| Method | Status codes |
|---|---|
| GET | 200, 401, 500 |
| POST | 201, 400 (×3), 401, 409, 500 |
| PUT | 200, 400 (×3), 401, 404, 409, 500 |
| DELETE | 200, 401, 500 |

The PUT `illegal_transition` (409) envelope carries `from`, `to`, and `allowedNext` so the frontend can render an honest error rather than guessing what moves are legal.

## Implementation notes

### State validation before write

The PUT handler loads the current row, calls `canTransition(currentState, requestedState)`, and rejects the move with 409 *before* writing. This means an illegal transition never reaches storage, so the database's `check` constraint and the application's `canTransition` predicate agree.

### Default initial state is `SAVED`, not `DISCOVERED`

`DISCOVERED` is the implicit state a student is in *before* any explicit action. The POST handler defaults to `SAVED` so the demo's "save" or "track" button creates a visible row immediately. A future ingestion job that pre-creates rows in `DISCOVERED` for "opportunities the student has interacted with but hasn't saved" can pass `initialState: "DISCOVERED"` explicitly.

### Idempotent delete

The DELETE handler returns 200 whether the row existed or not. A student clicking "remove from tracker" twice should not get an error on the second click.

### Error mapping regex

Same pattern as `/api/saved`:
- `/duplicate key/i` → 409 `already_tracked`
- `/foreign key/i` → 400 `invalid_request`
- anything else → 500 `error`

## How its tests prove behaviour

`src/lib/applications/stateMachine.test.ts` (7 tests):

- Every §37 forward transition is allowed
- Every §37 backtrack transition is allowed
- Every skip is forbidden (DISCOVERED → PREPARING, SAVED → READY, etc.)
- ACCEPTED, REJECTED, EXPIRED are terminal — no transition out
- Self-transitions are rejected
- All eight states are present in the transition table
- Default initial state is `SAVED`

`src/lib/db/applications.test.ts` (8 tests):

- `listApplicationsByUser` queries with user_id + updated_at order, returns empty, joins opportunities
- `getApplicationById` returns null + maps row
- `createApplication` inserts with the right shape, propagates duplicate-key errors
- `updateApplicationState` updates the state column
- `deleteApplication` deletes by id, propagates errors

`src/app/api/applications/route.test.ts` (12 tests):

- GET: 401, 200 empty, query shape, 500
- POST: 401, 400 (×3), 201 with default state, 409 duplicate, 400 FK violation, 500

`src/app/api/applications/[id]/route.test.ts` (10 tests):

- PUT: 401, 400 (×3), 404, 409 illegal transition (DISCOVERED → SUBMITTED), 409 terminal (ACCEPTED → SAVED), 200 happy transition, 500 path
- DELETE: 401, 200 happy, query shape, 500

`src/lib/db/testing/mock-supabase-client.ts` — `update` added to the chainable method list so the new repository's update calls are stubbed.

## How it connects to the rest of NEXTPATH

- **§37 Application tracker** — implemented verbatim in `stateMachine.ts` and the four route methods.
- **§65 MVP** — "APPLICATION TRACKER" is now ✓.
- **§43/§44 application_fields, application_documents** — out of MVP scope. The §37 state machine itself only needs `state`, `created_at`, `updated_at`; the wider per-application fields belong to future work.
- **§49 API structure** — `/api/applications` (list, create), `/api/applications/:id` (update, delete) match the blueprint's tree.
- **§38 Notifications** — explicit secondary scope, not built here. The state-machine's `updated_at` column gives a future notifications job the trigger timestamp it would need.
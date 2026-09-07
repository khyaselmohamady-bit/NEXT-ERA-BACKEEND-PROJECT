# `src/app/api/opportunities/route.ts` and `src/app/api/opportunities/[id]/route.ts`

Public read access to opportunity data. Satisfies the §65 "GLOBAL OPPORTUNITIES" MVP item and lets the demo's discovery and detail pages render without authentication.

## Beginner summary

Two routes, both public (no login required) because opportunities are public-read per the existing RLS policy:

- **`GET /api/opportunities`** — list every opportunity.
- **`GET /api/opportunities/:id`** — fetch one opportunity by id, or 404 if it doesn't exist.

Both delegate to the existing repository functions (`listOpportunities`, `getOpportunityById` in `src/lib/db/opportunities.ts`).

## Why public, not authenticated?

The blueprint's §65 puts GLOBAL OPPORTUNITIES in the MVP and the demo scene §80 (AI Search) needs to render opportunity cards before the student logs in. The existing `opportunities_select_all` RLS policy (`docs/db-schema.md`) explicitly grants public read access, so anonymous visitors can browse. **No write routes are exposed here** — the schema deliberately does not grant anon-write on opportunities until an admin role exists.

## Request/response

### `GET /api/opportunities`

No request body, no headers required.

- **200** — `{ status: "ok", items: Opportunity[], count: number }`
- **500** — `{ status: "error", message: string }`

`items` is always an array, possibly empty. "There are no opportunities yet" is a `200 ok` with `items: []`, not a 404 — because that case means the database has no rows, not that the resource "doesn't exist".

### `GET /api/opportunities/:id`

`:id` is a UUID (matches the `opportunities.id` primary key).

- **200** — `{ status: "ok", opportunity: Opportunity }`
- **404** — `{ status: "not_found", message: string }` when no row matches
- **500** — `{ status: "error", message: string }` on Supabase failure

## Implementation notes

### Response envelopes

Both routes return a discriminated union on `status`, matching the pattern established by `src/app/api/profile/route.ts`. The frontend can `switch (body.status)` and get exhaustive type-narrowing without inspecting HTTP codes.

### Next.js 16 dynamic route signature

Per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, the second argument to a route handler is `{ params: Promise<{...}> }`. We `await context.params` to read the id. This is the Next.js 16 signature — earlier versions (Next 13–14) used a synchronous `params` object; the upgrade to a Promise is what the project's `AGENTS.md` warns about.

### Repository reuse, no new SQL

Both routes are thin wrappers over functions that already exist and have their own unit tests (`src/lib/db/opportunities.test.ts`). Adding the routes did not require any new SQL, migrations, or RLS changes — the data layer is exactly what increment 2 already shipped.

## How its tests prove behaviour

`src/app/api/opportunities/route.test.ts` (2 tests):

- **200 empty** — mock returns `data: null` → `listOpportunities` maps to `[]` → response is `{ status: "ok", items: [], count: 0 }`.
- **500 on error** — mock returns `error: { message: "permission denied" }` → `listOpportunities` throws → route's catch returns 500 with the wrapped message.

`src/app/api/opportunities/[id]/route.test.ts` (3 tests):

- **200 found** — mock returns a row with all `NOT_STATED` requirements → response echoes `id` and `title` in camelCase.
- **404 missing** — mock returns `data: null` → response is `404` with `status: "not_found"` and a message containing the requested id.
- **500 on error** — mock returns an error → 500 with the wrapped message.

Both test files mock `@/lib/supabase/client` via `vi.mock` so the suite runs without a live Supabase project.

## How it connects to the rest of NEXTPATH

- **§9 Opportunity model, §44 opportunity_requirements table** — the row shape returned here is the same `Opportunity` type used by `src/lib/eligibility/evaluate.ts`.
- **§40 Discovery page, §42 Opportunity detail page** — these demo scenes render exactly what these two endpoints return.
- **§65 MVP** — "GLOBAL OPPORTUNITIES" is now ✓.
- **§50 Security** — anonymous reads are intentional and gated by RLS. Writes remain blocked at the database level until an admin role exists.
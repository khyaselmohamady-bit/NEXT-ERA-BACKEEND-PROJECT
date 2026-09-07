# `src/app/api/profile/route.ts`

The student-facing profile endpoint. Lets an authenticated student load and update their own profile, gated by the `Authorization: Bearer <jwt>` header so Supabase Auth verifies the request and the existing `auth.uid() = id` RLS policy on `profiles` is the actual security boundary.

## Beginner summary

This route is the **profile editor's network door**.

- `GET /api/profile` — "what's my profile right now?" Returns `{ status: "ok", profile: {...} }` with `profile: null` if the student has never saved one. **Always 200**, never 404, because "you haven't filled it out yet" is a normal state, not an error.
- `PUT /api/profile` — "save these fields on my profile." Returns the refreshed profile, so the frontend can render the saved state without a second round-trip. Returns **401** when unauthenticated, **400** for any malformed body.

## Why this design

**The frontend's profile editor and the eligibility engine both need the same data.** Today, the eligibility engine accepts an `EligibilityProfile` passed in the request body of `POST /api/eligibility/evaluate`, and the route-handler tests construct those profiles by hand. As soon as a logged-in student appears, the engine needs *their* profile, not a hand-crafted one — and that requires a route that can read and write it. Increment 6 (bulk eligibility) and the demo scene "Create student" (§79 of the blueprint) both depend on this route.

## Request/response

### `GET /api/profile`

Headers: `Authorization: Bearer <supabase-access-token>`.

- **200** — `{ status: "ok", profile: {...} | null }`
- **401** — `{ status: "unauthenticated", message: string }`

`profile: null` is the **expected** state for a student who has just signed up but hasn't completed onboarding. The frontend treats it as "show the empty form", not as an error.

### `PUT /api/profile`

Headers: `Authorization: Bearer <supabase-access-token>` + `Content-Type: application/json`.

Body (every field optional, but **at least one** required):

```json
{
  "nationalityCode": "EG",
  "birthDate": "2002-04-15",
  "educationLevel": "BACHELOR",
  "academicYear": 2,
  "gpa": 3.4,
  "residencyCountryCode": "EG",
  "hasRequiredLegalAuthorization": true
}
```

Responses:

- **200** — `{ status: "ok", profile: {...} }` (the post-merge row, freshly read)
- **400** — `{ error: "invalid_json" }` when the body isn't JSON
- **400** — `{ error: "invalid_profile", issues: [...] }` when Zod rejects (empty body, unknown field, bad enum, etc.)
- **401** — `{ status: "unauthenticated", message: string }`

## Implementation notes

### Authentication

`getCurrentUser(request)` is the only auth entry point. It calls `client.auth.getUser(jwt)`, which Supabase validates server-side; on success it returns the user id **and** a fresh per-request Supabase client whose `accessToken` is the verified JWT. That client is the one passed to `getProfileById` / `upsertProfile`, so every PostgREST call carries the student's JWT — which is what makes `auth.uid() = id` in `docs/db-schema.md` actually gate the data per user.

### `merge-then-upsert` strategy for PUT

The repository's `upsertProfile` takes a **full** `EligibilityProfile`, but a student editing one field shouldn't have to send the other seven. So the route reads the existing row first, spreads the parsed update over it (`{ ...(existing ?? {}), ...parsed.data }`), and upserts the merged object. Because `rowToProfile` converts nulls to undefined, the spread is field-by-field safe.

`.strict()` on the Zod schema means typos like `gpa: 3.8, evilField: "x"` are rejected at the boundary instead of silently being saved.

### Test-only authentication seam

`__setTestAuthenticate` swaps in a fake `getCurrentUser` for the duration of one test. Production code never touches it (it's `null` by default), and the test file's `afterEach` clears it after every test so failures can't leak state. This is the only seam Next.js's route-handler signature allows — Next passes a context object as the second positional argument, so injecting via a parameter would conflict.

### Why `200 + profile: null` instead of `404`

A 404 implies "this resource doesn't exist", which is misleading for a profile that's simply empty. Returning a 200 with `profile: null` lets the frontend use a single decoder (`if (profile === null) showEmptyForm(); else render(profile)`) and matches the existing repository contract: `getProfileById` uses `maybeSingle` deliberately because "profile missing" is a normal case, not an error.

## How its tests prove behaviour

`src/app/api/profile/route.test.ts` (10 tests):

- **401 missing token** — no `Authorization` header returns 401 with a message that mentions "Bearer".
- **401 invalid token** — `getCurrentUser` returns `invalid_token` → 401.
- **200 with profile** — full row → response echoes it in camelCase; assertion that `client.from("profiles")` was called.
- **200 with null profile** — `maybeSingle` returns `data: null` → response is `{ status: "ok", profile: null }`, **not** 404.
- **PUT 401** — same auth failure as GET.
- **PUT 400 invalid JSON** — body isn't JSON.
- **PUT 400 empty object** — refine-rule catches "no-op" PUTs.
- **PUT 400 unknown field** — `.strict()` rejects typos.
- **PUT 400 bad enum** — `educationLevel: "POTATO"` rejected.
- **PUT 200 merge** — sends `{ gpa: 3.8 }`, verifies three `from("profiles")` calls (existing, upsert, refreshed) and one upsert carrying the new GPA.

Every authenticated test injects a fake `getCurrentUser` via `__setTestAuthenticate`, so the suite runs without a live Supabase project.

## How it connects to the rest of NEXTPATH

- **§7 Profile completeness** (blueprint) — the engine already accepts a partial `EligibilityProfile`; this route is how the persisted version of that profile gets in and out of the database.
- **§49 API structure** — `GET /api/profile` and `PUT /api/profile` are the first two routes in the blueprint's API tree.
- **§57 Phase 1, §79 Scene 2** — "Create student" demo scene puts a real profile row through this endpoint.
- **§50 Security** — the RLS policy `auth.uid() = id` (see `docs/db-schema.md`) is the actual security boundary; the route exists to deliver a per-request JWT to PostgREST.
- **§6 "Why not?" / §22 bulk eligibility** — both will reuse the same `getCurrentUser` + repository pattern that this route introduces.
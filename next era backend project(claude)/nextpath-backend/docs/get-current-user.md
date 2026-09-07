# `src/lib/auth/getCurrentUser.ts` — new file

The single authentication entry point for every backend route handler that needs to know who is calling. Reads the request's `Authorization: Bearer <jwt>` header, validates it through Supabase's Auth server, and returns the verified user id plus a per-request Supabase client whose row-level security context matches that user.

## Beginner summary

This file answers one security question: **“Who sent this request?”**

The frontend sends a Supabase login token in the request. This helper asks Supabase to verify that token before believing it. If verification succeeds, the helper returns the student’s real user ID. If it fails or the token is missing, it returns an unauthenticated result that a route can turn into `401 Unauthorized`.

Do not confuse this file with a profile lookup. It does not load student details. It only proves who the caller is and creates a database client that carries that caller’s identity for Row-Level Security.

## Why bearer-token auth

Two reasonable approaches exist for a Supabase-backed Next.js API:

- **Cookie/session auth** via `@supabase/ssr`, which lets the same Supabase Auth JS client that signs the user in on the frontend also read its session cookie in route handlers.
- **Bearer-token auth**, where the frontend attaches `Authorization: Bearer <access_token>` to each API request, and the backend validates the token with `supabase.auth.getUser(jwt)`.

Neither is established in this project yet — `@supabase/ssr` isn't a dependency and the frontend doesn't exist — so this helper picks the bearer-token approach and states that choice prominently here so it can be revisited if a future increment goes the other way. Bearer is also the more explicit pattern when the frontend is built as a separate app: the JWT is already in memory after `signIn`, no cookie plumbing needed, and the request carries the credential with it.

## What it returns

`getCurrentUser(request, client?)` returns a discriminated union:

- `{ status: "authenticated", userId, user, client }` — Supabase verified the JWT and returned a user.
- `{ status: "unauthenticated", reason: "missing_credentials" | "invalid_token", message }` — either the request didn't carry a Bearer header (or carried a non-Bearer scheme), or Supabase rejected the token.

Route handlers are expected to switch on `result.status` and turn each branch into the right HTTP response (the future `/api/profile` route, for example, will return `401 { error: "unauthenticated", reason: ... }`). Throwing would force every caller to `try/catch` for what is in fact the expected, non-error outcome of "the request was anonymous."

## Security: why it goes through Supabase

The helper does not parse the JWT locally. It hands the token verbatim to `client.auth.getUser(jwt)`, which makes a round-trip to Supabase's GoTrue server, which validates the signature, expiry, and audience. Anything else — particularly trusting an unverified `sub` claim out of the token — would let an attacker forge a user id by hand-crafting an unsigned token and skip the server check entirely. The tests assert that the helper only ever reports an authenticated user after `auth.getUser` has actually been called with that token.

## Security: why it returns a fresh Supabase client

The returned `client` is a separate `createClient(...)` call configured with `accessToken: async () => verifiedJwt` and `persistSession: false`. Every PostgREST request this client makes carries the user's JWT in its `Authorization` header, so the `auth.uid()` predicate inside the RLS policies in `supabase/migrations/20260906120000_init_schema.sql` resolves to the same student the helper just verified — without that, a student could load anyone else's profile row by reusing a valid JWT with a manipulated `from`/`.eq` query.

Per-request is deliberate:
- No session is persisted to local storage / cookies (`persistSession: false`), so there's no shared auth state between requests in the same Node process.
- No token refresh happens (`autoRefreshToken: false`); if a route needs a longer-lived interaction, it should use the standard `@supabase/ssr` flow instead.
- Building a fresh client per request costs a single in-process object allocation, with no network call.

## The `client` parameter

Same convention as every other database-touching module in the project: an optional `SupabaseClient` injected as the last argument, defaulting to the cached `getSupabaseClient()` from `@/lib/supabase/client`. Tests pass a hand-rolled mock that records every `auth.getUser` call; production code never passes it.

## Environment requirements

`getCurrentUser` reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` through the new `getSupabaseConfig()` helper exported from `@/lib/supabase/client`. Both must be set or the helper throws with a clear "copy .env.example to .env.local" message — same as the existing client factory, since they share the config helper now.

## How its tests prove behaviour

`src/lib/auth/getCurrentUser.test.ts` covers seven cases with an injected mock that records every `auth.getUser` call:

1. **Valid JWT → authenticated.** Asserts the returned `userId`, `user.id`, `user.email`, and that `client` is an object with the expected shape.
2. **Bearer token is forwarded verbatim.** Asserts the mock's `__calls` contains `{ method: "auth.getUser", args: ["jwt-xyz"] }` — proving the helper does not invent a different token.
3. **No `Authorization` header → `missing_credentials`, no Supabase call.** Asserts `__calls` is empty — proving the helper short-circuits before bothering Supabase.
4. **`Authorization: Basic ...` → `missing_credentials`, no Supabase call.** Same assertion; only the right scheme counts.
5. **Supabase returns an error → `invalid_token` with that error message.** Asserts the message and that `auth.getUser` was still called (so we never trust the header).
6. **Supabase returns `{ data: { user: null } }` with no error → `invalid_token`.** Covers the case where Supabase silently rejects without surfacing an error string.
7. **The returned client is a real Supabase client.** Asserts `client.auth` is an object, so downstream code can wire it into the existing repositories.

The two "no Supabase call" cases (3 and 4) are what guarantee we don't leak existence of user accounts to unauthenticated callers — even a rejected JWT shouldn't be enough to make us talk to Supabase.

## Manual test guidance for teammates

Once real Supabase credentials exist in `.env.local` and the frontend has a sign-in flow:

1. Sign in via the frontend to obtain a Supabase access token (e.g. from `supabase.auth.getSession()` on the client).
2. Call any authenticated route (when one exists) with `Authorization: Bearer <token>` → expect a `200` with the route's payload.
3. Call the same route with no header → expect a `401` with `{ status: "unauthenticated", reason: "missing_credentials" }`.
4. Call the same route with `Authorization: Bearer not-a-real-jwt` → expect a `401` with `{ status: "unauthenticated", reason: "invalid_token" }` and a message from Supabase.

Until a route is wired up to actually use this helper, you can sanity-check it by writing a tiny scratch route that just calls `getCurrentUser(request)` and returns the result — no database changes required.

## Future increments

- A new `/api/profile` route will call `getCurrentUser`, return `401` when `status === "unauthenticated"`, and otherwise pass `result.client` (with the verified user's JWT) into `getProfileById` so RLS still gates the row.
- If a future increment introduces cookie-based auth (e.g. a same-origin frontend using `@supabase/ssr`), this helper is the right place to swap to `createServerClient(...)` and read cookies from the request — but the discriminated-union result shape and the contract "the returned client carries the user's auth context" are both load-bearing for the routes that consume it, so they should be preserved.

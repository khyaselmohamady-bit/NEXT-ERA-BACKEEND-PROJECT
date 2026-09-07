# `src/app/api/eligibility/evaluate/route.test.ts` — new file

Tests for the new API route, written against the route handler directly rather than by booting a dev server. Next.js Route Handlers speak the standard Web `Request`/`Response` API, so `POST()` can be called in plain Node with a real `Request` object and its response inspected exactly as a real client would see it.

## Beginner summary

These tests check the API door, not the eligibility rules themselves. They prove that valid JSON reaches the engine and bad JSON receives a clear `400` error instead of crashing the backend.

The test calls the exported `POST` function directly. This is faster than opening a browser and still checks the same request/response behaviour a frontend would use.

- **`jsonRequest(body)`** — a small helper that builds a `POST` `Request` with a JSON-stringified body and the right content-type header.
- **`validBody`** — a full, valid `{ profile, requirements, asOf }` payload matching the fixtures used in `evaluate.test.ts`, so a passing result here is a meaningful cross-check against the engine's own tests.

## The three cases
1. **Valid request → `200` with the engine's real verdict.** Confirms the route wires the request through to `evaluateEligibility` correctly and returns its output untouched (`verdict: "ELIGIBLE"`, empty `failedRequirements`).
2. **Invalid shape (`{ profile: {}, requirements: {} }`) → `400`.** Confirms zod validation actually rejects a malformed body and that the response includes `error: "invalid_request_shape"` plus a real `issues` array from zod.
3. **Malformed JSON body (`"{not json"`) → `400`.** Confirms the `request.json().catch(...)` guard works and returns `error: "invalid_json_body"` instead of the handler throwing an unhandled exception.

Together these cover the full round trip (success), a validation failure, and a parsing failure — the three ways a request to this endpoint can go.

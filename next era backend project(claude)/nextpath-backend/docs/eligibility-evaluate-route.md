# `src/app/api/eligibility/evaluate/route.ts` — new file

A Next.js Route Handler mounted at `POST /api/eligibility/evaluate`. This is the network-facing entry point into the pure engine in `src/lib/eligibility/evaluate.ts` — before this file existed, `evaluateEligibility` had no caller anywhere in the app.

## Beginner summary

This file is a **guard at the API door**. It receives JSON from outside the backend, checks that the JSON is safe and complete enough, then sends valid information to the eligibility engine.

It does not make an eligibility decision itself. Its job is only: read request -> validate request -> call engine -> return response. That division keeps the important rules easy to test.

## Request validation
Uses `zod` (already a dependency, previously unused anywhere in the project) to mirror the TypeScript contracts from `src/lib/eligibility/types.ts` at runtime:

- **`requirementSchema(valueSchema)`** — a generic builder for the `Requirement<T>` discriminated union (`EXPLICIT` / `AMBIGUOUS` / `NOT_STATED`), parameterized by whatever schema describes `value` for that particular rule.
- **`profileSchema`** — matches `EligibilityProfile`: every field optional, `educationLevel` restricted to the five valid enum values.
- **`requirementsSchema`** — matches `OpportunityHardRequirements`, building each of the eight fields via `requirementSchema` with the right `value` type (string array for nationality/residency, the age-range object, number array for academic year, a single number for GPA, `true` for legal authorization, a string for the deadline).
- **`requestSchema`** — the full POST body: `{ profile, requirements, asOf? }`. `asOf` is an optional ISO date string letting callers evaluate "as of" a specific date instead of the current moment (mainly useful for tests and demos).

The `satisfies z.ZodType<...>` annotations on `profileSchema` and `requirementsSchema` mean TypeScript itself checks that the zod schema and the hand-written interface haven't drifted apart.

## Handler behavior
`POST(request)`:
1. Parses the body as JSON. If that fails → `400 { error: "invalid_json_body" }`.
2. Validates the parsed body against `requestSchema`. If that fails → `400 { error: "invalid_request_shape", issues }`, where `issues` is zod's detailed list of what didn't match.
3. If `asOf` was provided but isn't a parseable date → `400 { error: "invalid_as_of_date" }`.
4. Otherwise calls `evaluateEligibility(profile, requirements, parsedAsOf)` and returns its result as `200` JSON — unmodified, since all decision logic stays in `evaluate.ts`.

Validation lives entirely in this file so the pure engine never has to trust or sanitize network input itself.

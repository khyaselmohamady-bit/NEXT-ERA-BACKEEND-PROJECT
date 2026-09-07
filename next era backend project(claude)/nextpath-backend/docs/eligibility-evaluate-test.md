# `src/lib/eligibility/evaluate.test.ts`

Vitest unit tests for the pure engine in `evaluate.ts`. These import `evaluateEligibility` directly — no server, no database, no HTTP — which is possible only because the engine has zero framework dependencies.

## Beginner summary

This file is a collection of **worked examples** for the rule checker. Each test says: “when these facts are true, this is the result we expect.”

Read a test as a short story: first look at the input, then predict the answer yourself, then read the `expect(...)` line to see the promised answer. These are often easier to understand than reading the engine first.

## Fixtures
- **`asOf`** — a fixed date (`2026-09-06`) so age and deadline checks are deterministic across runs.
- **`eligibleProfile`** — a student profile crafted to pass every rule in `explicitRequirements`.
- **`explicitRequirements`** — a full set of `EXPLICIT` hard requirements (Egyptian nationality, age 18–30, Bachelor's, year 2–4, GPA ≥ 3.2, Egypt residency, legal authorization required, deadline `2026-12-01`).

## The five cases
1. **All requirements pass → `ELIGIBLE`.** Baseline sanity check with no failures.
2. **GPA below minimum → `NOT_ELIGIBLE`.** Confirms the failure appears in `failedRequirements` with the exact structured data (`requirement: "gpa"`, `required: ">=3.2"`, `actual: 2.9`, `messageData.type: "gpa_below_minimum"`) — not just that the verdict flipped.
3. **Deadline already passed → `NOT_ELIGIBLE`.** Confirms `messageData.type` is `"deadline_passed"`.
4. **Ambiguous nationality wording → `LIKELY_ELIGIBLE`.** Everything else passes, but nationality is `AMBIGUOUS` instead of `EXPLICIT`, so that one check comes back `UNKNOWN` — and the overall verdict softens to `LIKELY_ELIGIBLE` rather than `ELIGIBLE` or a false rejection.
5. **Nothing stated at all → `UNKNOWN`.** Every requirement is `NOT_STATED`; every check comes back `UNKNOWN`, and the verdict is `UNKNOWN` rather than a false pass or fail.

Together these five cases exercise every branch of `verdictFromChecks`: a confirmed pass, a confirmed fail, a second kind of confirmed fail, one unknown mixed with passes, and all-unknown.

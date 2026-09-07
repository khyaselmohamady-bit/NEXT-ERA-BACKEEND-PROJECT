# `src/lib/eligibility/evaluate.ts`

The eligibility engine itself: a pure function that takes a student profile and an opportunity's hard requirements and returns a structured verdict. It has no dependency on Next.js, Supabase, or any AI provider — it only imports types from `./types`, which is what makes it independently testable and reusable from any entry point (API route, script, another service).

## Beginner summary

This is the project’s **rule checker**. Give it two things:

1. facts about one student; and
2. official hard rules for one opportunity.

It returns an answer plus the facts behind that answer. It never asks the database, never calls AI, and never changes data. That is why you can trust a GPA rule to work the same way in every route and every test.

Before reading the functions, open `evaluate.test.ts` and read the five examples. The examples show what the engine is trying to do.

## Date and display helpers
- **`parseIsoDate(value)`** — parses a `YYYY-MM-DD` string into a UTC `Date`, returning `undefined` for anything malformed. Using `Date.UTC` avoids the classic bug where a date parses differently depending on the server's local timezone.
- **`ageOn(birthDate, asOf)`** — computes age as of a given date, correctly handling the case where the birthday hasn't happened yet in the current year.
- **`displayList(values)`** — joins an array into a human-readable comma list, used when building the `required` field shown in a check (e.g. `"EG, SA, AE"`).

## Structured check builders
Four small factories that every rule evaluator uses, so all results share one shape:
- **`sourceUnknownCheck`** — used when the opportunity's requirement itself isn't `EXPLICIT` (it's `AMBIGUOUS` or `NOT_STATED`). Status is `UNKNOWN`.
- **`missingProfileCheck`** — used when the requirement is explicit but the student's profile is missing the relevant fact.
- **`passCheck`** / **`failCheck`** — used once both sides (requirement + profile fact) are known; `failCheck` also takes a machine-readable `failureType` string that ends up in `messageData`.

## Individual hard-requirement evaluators
One function per rule, each following the same pattern — if the requirement isn't `EXPLICIT`, return unknown; if the profile is missing the fact, return missing; otherwise compare and return pass/fail:
- **`evaluateNationality`** — checks `profile.nationalityCode` against the accepted list.
- **`evaluateAge`** — computes the student's age as of the evaluation date and checks it against `minimum`/`maximum`.
- **`evaluateAllowedValue`** — a generic evaluator reused for `education_level`, `academic_year`, and `residency`, since all three are "is this value in the accepted list" checks.
- **`evaluateMinimumGpa`** — checks `profile.gpa` against a minimum threshold.
- **`evaluateLegalAuthorization`** — checks the boolean `hasRequiredLegalAuthorization` flag.
- **`evaluateDeadline`** — parses the opportunity's deadline and compares it against `asOf`; treats an unparseable deadline as `UNKNOWN` rather than crashing.

## Verdict calculation
**`verdictFromChecks(checks)`** applies one priority order:
1. Any confirmed `FAIL` → **`NOT_ELIGIBLE`**, always, regardless of anything else.
2. No `FAIL` and no `UNKNOWN` → **`ELIGIBLE`**.
3. No `FAIL` but at least one `UNKNOWN`, and at least one confirmed `PASS` → **`LIKELY_ELIGIBLE`**.
4. No `FAIL`, at least one `UNKNOWN`, and zero confirmed passes → **`UNKNOWN`**.

This means missing or ambiguous source data can only ever soften a verdict toward uncertainty — it can never manufacture a rejection.

## Public entry point
**`evaluateEligibility(profile, requirements, asOf = new Date())`** runs all eight evaluators, feeds their results into `verdictFromChecks`, and returns `{ verdict, checks, failedRequirements }`. This is the only function the rest of the codebase needs to call — the new API route (`src/app/api/eligibility/evaluate/route.ts`) is a thin wrapper around it.

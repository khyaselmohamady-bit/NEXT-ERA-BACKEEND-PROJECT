# `src/lib/eligibility/types.ts`

Shared vocabulary for the eligibility engine. Contains only types/interfaces — no logic — so every other eligibility file (and the API route) can import from here without pulling in behavior.

## Beginner summary

This file is the **application form template** for eligibility. It does not calculate anything. It simply tells TypeScript which facts are allowed, such as a student's GPA or an opportunity's minimum age.

Read this file before `evaluate.ts`. If the words in this file are unclear, the calculation file will feel confusing because it uses these names everywhere.

## What's in it

- **`EligibilityVerdict`** — the four possible outcomes: `ELIGIBLE`, `LIKELY_ELIGIBLE`, `UNKNOWN`, `NOT_ELIGIBLE`.
- **`CheckStatus`** — the per-rule result: `PASS`, `FAIL`, or `UNKNOWN`.
- **`HardRequirementName`** — the fixed list of eight rules the engine checks (`nationality`, `age`, `education_level`, `academic_year`, `gpa`, `residency`, `legal_authorization`, `deadline`).
- **`EligibilityProfile`** — the student-side facts the engine reads (nationality code, birth date, education level, academic year, GPA, residency country, legal authorization). Every field is optional, since a student's profile can be incomplete.
- **`Requirement<T>`** — a discriminated union with three states:
  - `EXPLICIT` — the opportunity states this rule as a hard fact, with a `value` of type `T`.
  - `AMBIGUOUS` — the source text touches on this rule but isn't a clear hard requirement (optionally carries a `note`).
  - `NOT_STATED` — the opportunity's source material says nothing about this rule at all.

  This is the key design decision in the file: it keeps "the rule doesn't apply / isn't confirmed" distinct from "the rule failed," so the engine never invents a rejection from missing data.
- **`AgeRange`** — optional `minimum`/`maximum` bounds for the age rule.
- **`OpportunityHardRequirements`** — one `Requirement<T>` per hard rule, together describing everything the engine needs to know about an opportunity.
- **`EligibilityCheck`** — the engine's per-rule output: which requirement, its status, what was required vs. actual, and a `messageData` object with a machine-readable reason code (e.g. `gpa_below_minimum`) rather than a hand-written sentence — the frontend or an AI layer can turn this into prose without touching the decision logic.
- **`EligibilityResult`** — the full response: overall `verdict`, every individual `checks[]` entry, and `failedRequirements[]` pulled out for convenience.

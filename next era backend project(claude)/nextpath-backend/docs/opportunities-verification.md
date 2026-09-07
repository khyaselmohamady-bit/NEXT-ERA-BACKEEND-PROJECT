# `src/lib/opportunities/verification.ts` and the verification migration

The §65 "VERIFIED SOURCES" MVP item. Every opportunity now carries §12 metadata — where it was sourced, when it was last checked, what its verification status is, and how confident we are — and a small helper module exposes stable predicates and a user-visible descriptor so the frontend renders the "Verified from official source — last verified [date]" string the blueprint specifies.

## Beginner summary

- **Schema**: 4 nullable columns on `opportunities` (`source`, `last_verified_at`, `verification_status`, `confidence`).
- **Mapper**: `Opportunity` now has a `verification: Verification` field with the camelCase equivalents.
- **Helpers** (`src/lib/opportunities/verification.ts`): `isVerified`, `isHighConfidence`, `needsReview`, `describeVerification`.
- **Seed**: demo data exercises all three states (VERIFIED/HIGH, VERIFIED/MEDIUM, REVIEW_NEEDED/null).

## Why these four columns

The §12 verification diagram answers four questions for the student: *is this row real?* (`status`), *where did it come from?* (`source`), *how fresh is it?* (`lastVerifiedAt`), *how much should I trust it?* (`confidence`). Storing them as four nullable columns rather than a single JSONB blob keeps the CHECK constraints simple and the WHERE clauses indexable. A curator workflow (not in MVP) can filter `WHERE verification_status = 'REVIEW_NEEDED'` to find rows that need attention.

`status` and `confidence` are `text` columns with CHECK constraints rather than PostgreSQL `enum` types — a future increment that adds a new status (e.g. `STALE`) only needs to alter the constraint, not every row.

## Verification helper module

Four pure functions, no I/O:

| Function | Returns |
|---|---|
| `isVerified(v)` | `true` only when `status === "VERIFIED"` |
| `isHighConfidence(v)` | `true` only when `confidence === "HIGH"` |
| `needsReview(v)` | `true` for `REVIEW_NEEDED` **and** for missing status (unverified rows are review-pending by default) |
| `describeVerification(v)` | The §12 user-visible string |

`describeVerification` returns one of three exact strings, so the AI explanation layer (a future increment) can rely on the wording without re-deriving it:

```
"Verified from Official website on 2026-09-01."           ← VERIFIED with source + date
"Verified on 2026-09-01."                                  ← VERIFIED with date only
"Verification needed — data may be incomplete or out of date."  ← REVIEW_NEEDED
"Not yet verified."                                        ← null status
```

## Seed data

`supabase/seed.sql` populates all four columns on each row:

| Title | source | lastVerifiedAt | status | confidence |
|---|---|---|---|---|
| STEM Excellence Scholarship | "Official website" | 2026-09-01 | VERIFIED | HIGH |
| Global Graduate Fellowship | "Third-party aggregator" | 2026-08-15 | VERIFIED | MEDIUM |
| Community College Bridge Grant | null | null | REVIEW_NEEDED | null |

The demo scene's "verified" badge renders correctly on the first two rows and the third row shows the review-needed warning — covering every state the §12 diagram describes.

## How the public routes change

`GET /api/opportunities` and `GET /api/opportunities/:id` now include `verification` on each `Opportunity`. No envelope change (`status: "ok" | "not_found" | "error"` is unchanged) — only the `Opportunity` payload grew. Existing tests were updated to assert the new field.

## What's NOT being built

- ❌ Admin routes for editing verification status — no admin role exists yet
- ❌ Automatic re-verification cron — §67 future
- ❌ Verification badge component on the frontend — out of backend scope
- ❌ Source URL validation, source-ranking, scrape ingestion — §67 future

## How its tests prove behaviour

`src/lib/opportunities/verification.test.ts` (5 tests):

- `isVerified` true only for explicit VERIFIED
- `isHighConfidence` true only for explicit HIGH
- `needsReview` true for REVIEW_NEEDED and for missing status
- `describeVerification` produces the exact §12 strings
- `describeVerification` handles verified rows without a source label

`src/lib/db/opportunities.test.ts` (2 new tests):

- REVIEW_NEEDED maps to `Verification` with null source and date
- MEDIUM confidence is distinct from HIGH

`src/app/api/opportunities/[id]/route.test.ts` (1 updated test):

- The 200-found response now asserts `verification.status === "VERIFIED"` and `confidence === "HIGH"`

## How it connects to the rest of NEXTPATH

- **§12 Verification system** — the four columns and the `describeVerification` strings implement the diagram directly.
- **§42 Opportunity detail page** — the demo scene will render `describeVerification(opportunity.verification)` next to the title.
- **§65 MVP** — "VERIFIED SOURCES" is now ✓.
- **§11 "Don't scrape the entire internet"** — verification metadata is what makes a curated 100-row database trustworthy instead of just smaller.
# `src/lib/match/*` and `src/app/api/match/evaluate/route.ts`

The deterministic match engine and its HTTP endpoint. Satisfies the §65 "MATCH SCORE" MVP item. The engine sits behind the eligibility engine in the demo flow: a student is only ever shown a match score for an opportunity they have already passed the hard-eligibility check on (handled at the route layer in a future demo glue path, not here).

## Beginner summary

- **`evaluateMatch(profile, opportunity)`** — pure function, returns `{ score, verdict, checks }`. No I/O, no AI.
- **`POST /api/match/evaluate`** — accepts `{ profile, opportunity }` JSON, validates with Zod, returns the engine result.

A `score` of `100` with `verdict: "STRONG"` is the goal of a fully-aligned profile. `null` means "we have nothing to score with" — not zero.

## Why a separate engine from eligibility

The blueprint's §3 golden rule is that **AI does not decide eligibility**. The match engine is similarly deterministic, but it produces a *graded* output (0–100 with sub-scores), not a pass/fail. Keeping the two engines in separate files means the eligibility engine stays audit-clean and the match engine can evolve (weights, dimensions, language rules) without touching §13/§16.

## Engine layout

```
src/lib/match/
├── types.ts        # MatchProfile, MatchOpportunity, MatchCheck, MatchResult, MATCH_WEIGHTS
├── evaluate.ts     # evaluateMatch() — pure
└── evaluate.test.ts
```

The seven sub-scores and their weights (from §18):

| Dimension | Max |
|---|---|
| major | 20 |
| skills | 20 |
| interests | 15 |
| goals | 15 |
| experience | 10 |
| language | 10 |
| academic | 10 |
| **total** | **100** |

These weights are pinned in `MATCH_WEIGHTS` (a `const` object) so any test or future UI can audit the breakdown in one place.

## Scoring rules

- Token-based overlap on free-text fields. Lowercase + trim; dedupe on the student side.
- Score = "share of preferred tokens the student covers", **not** "share of student tokens the opportunity accepts". A student with zero relevant skills against a skills-heavy opportunity gets 0, not a free pass.
- Languages are tuples `{ language, level }` — both must match exactly. The blueprint doesn't model CEFR ordering in MVP data, so `B1` does **not** count as a hit for a `C1` requirement. A future increment can layer in CEFR comparison.
- `award(...)` and `languageCheck(...)` emit a `MatchCheck` for every dimension, in the documented order. `awarded: null` means the opportunity had no preferred tokens for that dimension — the engine never invents data.
- The overall `score` is `null` (and `verdict: "UNKNOWN"`) only if **every** dimension had no preferred tokens. Otherwise it's the sum of awarded points.

## Verdict bands

| Score | Verdict |
|---|---|
| ≥ 80 | STRONG |
| ≥ 60 | GOOD |
| ≥ 40 | FAIR |
| < 40 | POOR |
| `null` | UNKNOWN |

## Persistence

The match engine's input is stored as a single JSONB column on `profiles`:

```sql
-- supabase/migrations/20260907090000_soft_facts.sql
alter table public.profiles
  add column if not exists soft_facts jsonb not null default '{}'::jsonb;
```

The §65 MVP does **not** require the per-table layout (`educations`, `skills` + `profile_skills`, `languages` + `profile_languages`, `experiences`, `documents`) shown in §44. Storing soft facts in one column keeps the MVP honest and lets the match engine evolve without join-table migrations. If a future increment adds analytics over individual skills or experiences, the JSONB column can be promoted to relational tables without changing the engine's interface.

## `POST /api/match/evaluate`

Body:

```json
{
  "profile": {
    "major": ["Computer Engineering"],
    "skills": ["Python", "PyTorch"],
    "interests": ["AI"],
    "goals": ["research"],
    "experience": ["research intern"],
    "languages": [{ "language": "English", "level": "C1" }],
    "academicFit": ["honors list"]
  },
  "opportunity": {
    "preferredMajors": ["Computer Engineering"],
    "preferredSkills": ["Python", "PyTorch"],
    "preferredInterests": ["AI"],
    "preferredGoals": ["research"],
    "preferredExperience": ["research intern"],
    "preferredLanguages": [{ "language": "English", "level": "C1" }],
    "preferredAcademicFit": ["honors list"]
  }
}
```

Responses:

- **200** — `{ status: "ok", result: { score, verdict, checks[] } }`
- **400** — `{ error: "invalid_json" | "invalid_match_request", … }`

The route does **not** authenticate and does **not** touch the database. The frontend loads the profile via `GET /api/profile` and the opportunity via `GET /api/opportunities/:id`, then sends the soft halves here. This keeps the route cheap (no DB roundtrip) and lets the frontend cache opportunity soft facts across multiple match calls.

## How its tests prove behaviour

`src/lib/match/evaluate.test.ts` (10 tests):

- Full coverage → score 100, verdict STRONG, every check at max
- Opportunity has no preferred tokens → score null, verdict UNKNOWN
- Student lists nothing → score 0, verdict POOR
- Partial coverage yields proportional score (50% of skills = 10 of 20)
- Verdict bands pinned at 20 (POOR), 40 (FAIR), 70 (GOOD), 80 (STRONG)
- Case-insensitive + deduplicated tokens on the student side
- Language tuple must match both language and level exactly
- Match checks emitted in the documented order
- Sum of weights = 100

`src/app/api/match/evaluate/route.test.ts` (7 tests):

- 400 invalid JSON
- 400 missing profile or opportunity
- 400 unknown field (`.strict()`)
- 400 malformed language tuple
- 200 STRONG on full coverage
- 200 UNKNOWN when opportunity has no preferences
- 200 POOR when student has no data

`src/lib/db/profiles.test.ts` (3 new tests):

- `getMatchProfileById` returns the `soft_facts` JSONB column as a `MatchProfile`
- `getFullProfileById` returns both halves
- `upsertSoftFacts` writes the soft_facts column only

`src/app/api/profile/route.test.ts` (2 new tests + 1 updated):

- Updated GET shape now returns `{ eligibility, match }` halves
- New: PUT with `softFacts` writes a second upsert carrying the soft column
- New: PUT rejects unknown soft-fact fields with 400

## How it connects to the rest of NEXTPATH

- **§17 Match engine, §18 Match score** — implemented verbatim in `evaluate.ts`.
- **§19 "Why the match?"** — the `checks[]` array is what the frontend renders when the student clicks "Why 93%?" Each check has `dimension`, `awarded`, `max`, and a `messageData.type` stable code the AI explanation layer (§25, future) can turn into prose.
- **§65 MVP** — "MATCH SCORE" is now ✓.
- **§3 Golden rule** — the engine has zero AI imports. The verdict is decided by code only.
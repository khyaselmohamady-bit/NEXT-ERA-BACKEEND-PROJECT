# NEXTPATH Backend

> **Backend service for NEXTPATH** — the opportunity-intelligence and application-readiness platform built for the IMPACT 2026 hackathon. Lets students discover global opportunities, see deterministic eligibility verdicts and match scores, save the ones they care about, and track applications through a state machine.

The full §65 MVP is shipped: 12 routes, two deterministic engines, a state machine, and the database schema. **AI does NOT decide eligibility** — the database and the rules are the source of truth (blueprint §3 golden rule).

## Stack

| Concern | Tool |
|---|---|
| HTTP framework | Next.js 16.3.4 (App Router) + TypeScript |
| Database, auth, RLS | Supabase + PostgreSQL |
| Runtime validation | Zod |
| Tests | Vitest |
| Package manager | pnpm 12 |
| Node | >= 20 |

## Quick start

```bash
# 1. Install
pnpm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with values from your Supabase project.

# 3. Apply migrations (Supabase CLI)
supabase db push
# Or run each file in supabase/migrations/ in filename order.

# 4. Load demo data (optional)
psql -f supabase/seed.sql

# 5. Verify
pnpm typecheck
pnpm test
pnpm build

# 6. Run
pnpm dev
# → http://localhost:3000
```

Health check: `curl http://localhost:3000/api/health`.

## What's built

### 12 routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness |
| GET | `/api/profile` | Load authenticated student's profile |
| PUT | `/api/profile` | Update profile (eligibility + soft facts) |
| GET | `/api/opportunities` | Public list of opportunities |
| GET | `/api/opportunities/:id` | Public detail |
| POST | `/api/eligibility/evaluate` | Hard-eligibility verdict |
| POST | `/api/match/evaluate` | Soft match score (0–100) |
| GET | `/api/saved` | List saved opportunities |
| POST | `/api/saved` | Save one |
| DELETE | `/api/saved/:id` | Unsave one |
| GET | `/api/applications` | List tracked applications |
| POST | `/api/applications` | Create a tracker row |
| PUT | `/api/applications/:id` | Transition state (§37) |
| DELETE | `/api/applications/:id` | Remove from tracker |
| POST | `/api/search` | Structured + AI NL search |

### Two deterministic engines

- **Eligibility engine** (`src/lib/eligibility/`) — evaluates hard requirements from `OpportunityHardRequirements` against an `EligibilityProfile`. Returns one of `ELIGIBLE` / `LIKELY_ELIGIBLE` / `UNKNOWN` / `NOT_ELIGIBLE` with structured `checks[]` so the frontend can render "why eligible?" / "why not?" without re-running rules.
- **Match engine** (`src/lib/match/`) — produces a 0–100 score across seven sub-scores from the blueprint §18 example (Major 20 / Skills 20 / Interests 15 / Goals 15 / Experience 10 / Language 10 / Academic 10). Returns a verdict band (`POOR` / `FAIR` / `GOOD` / `STRONG`) plus a per-dimension breakdown.

### One state machine

`src/lib/applications/stateMachine.ts` — the §37 lifecycle:

```
DISCOVERED → SAVED → PREPARING → READY → SUBMITTED → ACCEPTED | REJECTED
                ↑        ↑          ↑
                └────────┴──────────┘   (backtrack allowed)
ACCEPTED | REJECTED | EXPIRED          (terminal — no transitions out)
```

Forbids skipping (e.g. `DISCOVERED → SUBMITTED` returns 409 with the legal next states).

### Database schema (5 migrations)

`supabase/migrations/` in filename order:

1. `20260906120000_init_schema.sql` — `profiles`, `opportunities`, RLS, `updated_at` trigger
2. `20260907090000_soft_facts.sql` — `soft_facts jsonb` on `profiles`
3. `20260907100000_verification.sql` — §12 verification columns on `opportunities`
4. `20260907110000_saved_opportunities.sql` — `saved_opportunities` + RLS
5. `20260907120000_applications.sql` — `applications` + 8-state CHECK + 4 RLS policies

Every user-owned table has `auth.uid() = user_id` RLS policies; `opportunities` is intentionally public-read.

## Tests

```bash
pnpm typecheck    # tsc --noEmit
pnpm test         # 152 tests across 20 files
pnpm build        # production build
```

Coverage:
- **Every route** — every documented status code (401/400/404/409/500/200/201)
- **Every repository** — return shape + PostgREST query shape through mock client
- **Both engines** — exhaustive deterministic fixtures (PASS/FAIL/UNKNOWN for every hard requirement, every verdict band for match)
- **State machine** — every §37 transition, every forbidden skip, terminal-state discipline
- **AI adapter** — no-op default, env-var-aware selection

What the tests do NOT cover: a live Supabase project, a live AI provider, e2e / integration tests, load tests, security audits. The `HANDOFF.md` document spells out the integration plan for the DB and AI teammates.

## Documentation

- `docs/README.md` — guided tour for newcomers (read first)
- `docs/<source-file>.md` — one Markdown per source file explaining *why*, not just *what*
- `HANDOFF.md` — handoff document for the DB and AI teammates (what to build, what NOT to build)
- `CHANGES.md` — 14 dated increment entries showing exactly what each commit added, why, and how it was verified
- `nextpath_blueprint_v3-2.pdf` — the 97-page master blueprint (ask the team for the latest copy)

## Project layout

```
src/
├── app/api/                  # 12 route handlers
├── lib/
│   ├── eligibility/          # Hard-eligibility engine (§13-§16)
│   ├── match/                # Match-score engine (§18)
│   ├── applications/         # §37 state machine
│   ├── opportunities/        # §12 verification helpers
│   ├── search/               # AI adapter interface + no-op default
│   ├── auth/                 # getCurrentUser (bearer-JWT auth)
│   ├── db/                   # Repository layer (one file per table)
│   ├── db/testing/           # Mock Supabase client
│   └── supabase/             # getSupabaseClient factory
└── ...
supabase/
├── migrations/               # 5 SQL files, applied in filename order
└── seed.sql                  # 3 demo opportunities (verified rows)
docs/                         # One Markdown per source file
CHANGES.md                    # 14 dated increment entries
HANDOFF.md                    # Handoff for DB & AI teammates
```

## Conventions

- **Source files** are divided into named `SECTION:` blocks with `End of section` comments explaining *why*.
- **Routes** validate request bodies with Zod (`.strict()`, `.refine` for non-empty refinements), return discriminated-union envelopes on `{ status }`, and map database errors to stable HTTP codes.
- **Repositories** accept an optional `SupabaseClient` so tests can inject a mock; map snake_case to camelCase in one place; throw descriptive `new Error("...: ${error.message}")` on Supabase failure.
- **Engines are pure** — no I/O, no AI, no Supabase — and are tested with deterministic fixtures.
- **AI never decides eligibility** — the adapters return filter objects or verdict explanations, never the underlying decisions.

## What's explicitly NOT built (and why)

Per the blueprint's §66 (secondary), §67 (future), and §68 (drop), these are **deferred** and should not be added without an explicit MVP-scope decision:

- ❌ Notifications engine (§38)
- ❌ Documents table / Supabase Storage (§44)
- ❌ Profile gap analysis (§21)
- ❌ AI application assistant (§28)
- ❌ Auto-apply / browser autofill (§29–§30)
- ❌ Real OpenRouter adapter (deferred — adapter interface exists, no provider wired)
- ❌ Microservices / Docker / K8s (§68)
- ❌ Native mobile (§68)
- ❌ Social features — friends, posts, likes, comments, messaging (§68)

If anyone asks for these during the MVP, point them at `HANDOFF.md` §7.

## Team

Built for **IMPACT 2026 hackathon** by the NEXTPATH team. See `HANDOFF.md` for the role split between the backend, database, and AI contributors.

## License

Internal team working document. Confidential.
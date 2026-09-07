# NEXTPATH Backend — Handoff for DB & AI teammates

> **Audience:** the teammate who owns the Supabase/Postgres database side and the teammate who owns the AI integration side. Read this top-to-bottom before touching any of the schemas or the `/api/search` route.

The full §65 MVP backend is shipped and verified. This document explains what is already built, where it lives in the repo, and how your work plugs in.

---

## TL;DR

- **Database teammate:** all tables and RLS policies are already in `supabase/migrations/`. Run them in order. The `§65 MVP` schema is complete.
- **AI teammate:** implement one interface — `AiSearchAdapter` in `src/lib/search/aiAdapter.ts` — and the `/api/search` route flips from structured-only to natural-language on the same day. **You do not touch the database, eligibility, or match code.**

If you only have 5 minutes, read the **§23 guardrail** and the **Adapter contract** sections below. Everything else is detail.

---

## 1. Repo layout (what's where)

```
nextpath-backend/
├── src/
│   ├── app/api/                  # 12 route handlers (Next.js 16 App Router)
│   ├── lib/
│   │   ├── eligibility/          # Hard-eligibility engine (§13-§16)
│   │   ├── match/                # Match-score engine (§18)
│   │   ├── applications/         # §37 state machine
│   │   ├── opportunities/        # §12 verification helpers
│   │   ├── search/               # AI adapter interface + no-op default
│   │   ├── auth/                 # getCurrentUser (bearer-JWT auth)
│   │   ├── db/                   # Repository layer (one file per table)
│   │   ├── db/testing/           # Mock Supabase client for unit tests
│   │   └── supabase/             # getSupabaseClient factory
│   └── ...
├── supabase/
│   ├── migrations/               # 5 SQL files, applied in filename order
│   └── seed.sql                  # 3 demo opportunities (verified rows)
├── docs/                         # One Markdown per source file (read these!)
└── CHANGES.md                    # 14 dated increment entries (read for context)
```

Read `docs/README.md` first — it has a guided tour for newcomers.

---

## 2. Database teammate

### 2.1 Migrations to run, in order

```
20260906120000_init_schema.sql       profiles + opportunities + RLS + updated_at trigger
20260907090000_soft_facts.sql        soft_facts jsonb column on profiles (match engine input)
20260907100000_verification.sql      source / last_verified_at / verification_status / confidence
20260907110000_saved_opportunities.sql
20260907120000_applications.sql     applications + §37 state CHECK + 4 RLS policies
```

Apply with `supabase db push` or by running each file manually. They are idempotent where possible (`if not exists` / `add column if not exists`) but the trigger creation in `20260907120000_applications.sql` is not — apply each file exactly once per environment.

### 2.2 Tables — current state

| Table | Purpose | MVP owner |
|---|---|---|
| `profiles` | One row per student; both hard-eligibility facts and soft-match facts. | `src/lib/db/profiles.ts` |
| `opportunities` | One row per opportunity; hard requirements stored as JSONB, §12 verification metadata. | `src/lib/db/opportunities.ts` |
| `saved_opportunities` | Boolean bookmark; `unique(user_id, opportunity_id)`. | `src/lib/db/saved.ts` |
| `applications` | Tracker with `state` CHECK pinned to the eight §37 values. | `src/lib/db/applications.ts` |

**`auth.users`** is owned by Supabase Auth. Every user-owned table above has `user_id uuid not null references auth.users(id) on delete cascade`.

### 2.3 RLS posture

Every user-owned table has `auth.uid() = user_id` policies for `select`/`insert`/`update`/`delete`. `opportunities` is intentionally public-read. **Writes to `opportunities` go through a service-role client** until an admin role exists (not built yet — out of MVP scope per §68).

### 2.4 What the schema does NOT have (intentional, MVP scope)

These were *deliberately* excluded because they're §66 secondary or §67 future:

- `educations`, `skills` + `profile_skills`, `languages` + `profile_languages`, `experessions` (per-table soft-facts layout from §44) — MVP uses a single `profiles.soft_facts jsonb` column instead
- `documents`, `application_fields`, `application_documents` (§44) — not built
- `notifications` (§38) — not built
- `organizations` (§44) — not built; `organization` is currently a free-text column on `opportunities`
- Dedicated `category`, `field`, `funding`, `location` columns — search filters use JSONB fields and `ilike` instead

### 2.5 Seed data

`supabase/seed.sql` populates three opportunities that exercise every documented state of the eligibility and verification engines:

| Title | Eligibility | Verification |
|---|---|---|
| STEM Excellence Scholarship | Full EXPLICIT match | VERIFIED / HIGH / Official website |
| Global Graduate Fellowship | Mostly NOT_STATED | VERIFIED / MEDIUM / Third-party aggregator |
| Community College Bridge Grant | Age cap + multi-nationality | REVIEW_NEEDED |

### 2.6 When you (DB teammate) add a column

1. Write a new migration file with a `YYYYMMDDhhmmss_*.sql` name **later than `20260907120000_applications.sql`**.
2. Update the snake_case field in the corresponding `src/lib/db/*.ts` `Row` interface.
3. Update the camelCase field in the corresponding application type (and the mapper if needed).
4. Update `seed.sql` if your column is non-null.
5. Add a unit test in the corresponding `*.test.ts` pinning the new mapping.
6. Add a `CHANGES.md` increment entry with the exact `pnpm test` result.

This is the **same loop** every backend increment followed (see `CHANGES.md`).

### 2.7 When you (DB teammate) need a new endpoint

Hand it back to the backend teammate with:
- The migration (or ask them to write it following the pattern in `20260907120000_applications.sql`).
- The expected query shape (filters, joins, expected columns).

The backend teammate owns the route handler, Zod validation, and HTTP contract. You own the migration and the RLS policy.

---

## 3. AI teammate

### 3.1 What you build

**One file:** an implementation of the `AiSearchAdapter` interface in `src/lib/search/aiAdapter.ts`. That's it.

```ts
// src/lib/search/aiAdapter.ts (already exists, here's the contract)
export interface SearchFilters {
  query?: string;             // free-text hint
  nationality?: string;       // 2-3 letter country code
  educationLevel?: "SECONDARY" | "DIPLOMA" | "BACHELOR" | "MASTER" | "PHD";
  deadlineBefore?: string;    // YYYY-MM-DD
}

export type AiParseResult =
  | { status: "parsed"; filters: SearchFilters }
  | { status: "disabled"; message: string };

export interface AiSearchAdapter {
  parseQuery(query: string): Promise<AiParseResult>;
}
```

Then update `selectAiAdapter()` in the same file to return your implementation when `process.env.AI_PROVIDER_API_KEY` is set:

```ts
export function selectAiAdapter(): AiSearchAdapter {
  if (process.env["AI_PROVIDER_API_KEY"]) {
    return new OpenRouterAdapter(process.env["AI_PROVIDER_API_KEY"]);
  }
  return noOpAdapter;
}
```

### 3.2 The §23 guardrail — non-negotiable

The blueprint §23 says: **AI must NOT search the internet and make up results.** This is enforced by the *adapter contract itself* — the `parseQuery` method only ever returns filter objects. The route never trusts the AI with opportunity rows. Zero results means the database had no matches, not that the AI declined to answer.

**Your adapter must:**
- Return only filter objects. No opportunity IDs, no titles, no organizations.
- Return `disabled` if you can't reach your provider, not an empty filter set.
- Validate every field you return against the `SearchFilters` shape. If the model returns garbage, return `disabled`.

**Your adapter must NOT:**
- Call the database.
- Call any other route in this project.
- Cache results across requests (the route handles that).

### 3.3 Example adapter skeleton

```ts
// src/lib/search/openRouterAdapter.ts
import type { AiParseResult, AiSearchAdapter, SearchFilters } from "./aiAdapter";

const SYSTEM_PROMPT = `
You are a filter extractor for an opportunity search engine.
Given a natural-language query, return ONLY a JSON object matching this shape:
{
  "query"?: string,        // 1-5 keywords
  "nationality"?: string,  // 2-3 letter country code
  "educationLevel"?: "SECONDARY"|"DIPLOMA"|"BACHELOR"|"MASTER"|"PHD",
  "deadlineBefore"?: string // YYYY-MM-DD
}
Never invent opportunities. Never invent values. If the query doesn't
clearly map to a filter, omit that field.`;

export class OpenRouterAdapter implements AiSearchAdapter {
  constructor(private apiKey: string) {}

  async parseQuery(query: string): Promise<AiParseResult> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "minimax/minimax-m3",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      return { status: "disabled", message: "AI provider unavailable." };
    }

    const body = await response.json();
    const content = body.choices?.[0]?.message?.content;
    if (!content) {
      return { status: "disabled", message: "AI returned no content." };
    }

    try {
      const parsed = JSON.parse(content) as SearchFilters;
      // Validate the parsed shape here. If anything is off, return disabled.
      return { status: "parsed", filters: parsed };
    } catch {
      return { status: "disabled", message: "AI returned non-JSON content." };
    }
  }
}
```

### 3.4 Testing your adapter

Add a file `src/lib/search/openRouterAdapter.test.ts` with at least:

- ✅ A valid query returns `{ status: "parsed", filters: { ... } }`.
- ✅ The provider returning 5xx returns `{ status: "disabled", message: ... }`.
- ✅ The provider returning non-JSON returns `disabled`.
- ✅ A query that maps to no fields returns `disabled` (or `{ status: "parsed", filters: {} }` — your choice, but document and pin it).

Use `vi.spyOn(globalThis, "fetch")` to mock the HTTP call — there's no need for a real OpenRouter account in CI.

### 3.5 What you do NOT build

- ❌ A real `/api/match/evaluate` — that's a deterministic rule engine, not AI.
- ❌ A real `/api/eligibility/evaluate` — same.
- ❌ The `applications` state machine — that's a pure transition table.
- ❌ Anything that touches the database directly — all data goes through `src/lib/db/*.ts`.

If a future increment adds an AI explanation layer (§25 MVP) or an AI application-text drafter (§28 secondary), you'll be back. Until then, **the search adapter is your entire surface area**.

---

## 4. Cross-cutting contracts (read these before touching anything)

### 4.1 Zod validation

Every route validates its request body with Zod (`.strict()` everywhere, `.refine` for non-empty refinements). The validation errors map to **400** with a `{ error, issues }` envelope. If you (DB) add a column that should be filterable, the matching filter field goes into the Zod schema **and** the SQL builder in `src/lib/db/opportunities.ts` (`searchOpportunities`).

### 4.2 Error mapping

Across all routes:
- **401** `{ status: "unauthenticated", message }` — missing/invalid Bearer token (handled by `getCurrentUser`)
- **400** `{ error: "...", message: "...", issues?: [...] }` — Zod or JSON validation failure
- **404** `{ status: "not_found", message }` — resource missing
- **409** `{ status: "..." | "illegal_transition", message }` — uniqueness violation or illegal state move
- **500** `{ status: "error", message }` — anything else

### 4.3 Repository pattern

Every `src/lib/db/*.ts` file:
- Exports `getXById`, `listXByUser`, `upsertX`, `deleteX` (or analogous) with an optional `client: SupabaseClient = getSupabaseClient()` last parameter.
- Throws `new Error("...: ${error.message}")` on Supabase failure (never returns the raw error).
- Maps snake_case columns to camelCase application types in one place.

If you add a new table, mirror this pattern. The unit tests in `*.test.ts` use the mock client from `src/lib/db/testing/mock-supabase-client.ts` — extend its chainable method list if your query needs new methods.

### 4.4 Test conventions

- **152 tests passing** as of the last increment.
- Every new behaviour gets a test (see `CHANGES.md` increment 9 for the template).
- Routes use the `__setTestAuthenticate` seam in `src/lib/auth/getCurrentUser.ts` so they don't need a live Supabase Auth.
- Repositories inject the mock Supabase client so they don't need a live database.
- Engines are pure — no I/O — and are tested with deterministic fixtures.

---

## 5. Common questions

**Q: Where do I add a new opportunity?**
A: Through a service-role Supabase client (or a future admin route — not built). The `opportunities` table is intentionally not writable by the `anon` or `authenticated` roles until an admin role exists.

**Q: Where do I check the user's eligibility?**
A: `POST /api/eligibility/evaluate` accepts a profile + opportunity hard-requirements JSON and returns the engine verdict. The frontend never computes this client-side.

**Q: Where do I compute the match score?**
A: `POST /api/match/evaluate`. Same pattern as eligibility but with the soft-facts shapes.

**Q: How does auth work?**
A: `Authorization: Bearer <supabase-access-jwt>`. `getCurrentUser` validates the JWT through Supabase Auth and returns a per-request client whose JWT is forwarded on every PostgREST call (which is what makes the `auth.uid() = user_id` RLS policies work).

**Q: Why is `/api/search` returning 400 `ai_disabled`?**
A: The AI provider is not configured (`AI_PROVIDER_API_KEY` is unset). The route accepts structured `{ filters: { ... } }` instead. Wire the AI adapter (see §3 above) to enable the `{ query: "..." }` form.

**Q: Why are no opportunities showing up?**
A: Three usual suspects: (1) `seed.sql` wasn't run; (2) RLS — verify the JWT carries the right `sub`; (3) the search filters don't match — try `{ filters: {} }` *with at least one field* (the route rejects empty filter objects).

---

## 6. Build, test, verify

The same three commands run by every increment:

```bash
pnpm typecheck    # tsc --noEmit, must be clean
pnpm test         # vitest run, must be 152/152 (or more after your changes)
pnpm build        # next build, must succeed with all 12 routes registered
```

CI expected to fail if any of the three fail. Document any new test counts in `CHANGES.md` as a new increment entry.

---

## 7. What's explicitly out of scope (do not build)

Per the blueprint's §66 (secondary), §67 (future), and §68 (drop):

- Notifications engine (§38)
- Documents table / Supabase Storage (§44)
- Profile gap analysis (§21)
- AI application assistant (§28)
- Auto-apply / browser autofill (§29-§30)
- Microservices / Docker / K8s (§68)
- Native mobile (§68)
- Social features — friends, posts, likes, comments, messaging (§68)

If anyone asks for these in this MVP, push back: they were deliberately deferred.

---

## 8. Pointers

- Blueprint: `nextpath_blueprint_v3-2.pdf` (97 pages). Read §44 (DB), §49 (API), §65 (MVP), §22-§23 (AI search) at minimum.
- Schema overview: `docs/db-schema.md`.
- API surface: this document + `docs/<route>.md` for each route (12 of them in `docs/`).
- State machine: `src/lib/applications/stateMachine.ts` and `docs/applications.md`.
- AI adapter contract: `src/lib/search/aiAdapter.ts` and `docs/ai-search.md`.
- Original handoff prompt (still relevant): `src/lib/db/hermes-nextpath-backend-handoff-prompt.md`.

Welcome aboard. The §65 MVP is yours to demo.
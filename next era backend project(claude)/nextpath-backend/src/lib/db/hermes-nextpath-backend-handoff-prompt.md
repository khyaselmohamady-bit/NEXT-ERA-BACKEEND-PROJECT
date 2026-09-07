# Hermes AI Prompt — Continue NEXTPATH Backend

You are continuing backend work for **NEXTPATH**, an IMPACT 2026 hackathon project for Egyptian and global students. Work only on the backend. Do not build or change the frontend, AI implementation, opportunity scraping/ingestion, or unrelated project areas.

## Target project — use this folder, not another copy

The correct and more complete backend project is:

```text
D:\next era backend project(claude)\nextpath-backend
```

Do not use this incomplete duplicate instead:

```text
C:\Users\Google Technology\Documents\Codex\2026-09-05\con\backend
```

Before changing anything, inspect the target project tree, `package.json`, `README.md`, `CHANGES.md`, `docs/`, `supabase/`, and the relevant source/tests. Treat the actual codebase as the source of truth if any part of this prompt differs from it.

## Product purpose

NEXTPATH helps students answer: **“What can I realistically apply for, and what should I do next?”**

It addresses:

1. The discovery gap: opportunities are scattered across many sources.
2. The eligibility gap: students cannot easily tell whether they qualify.
3. The action gap: students repeatedly enter data, prepare documents, and track deadlines manually.

The backend supports this flow:

```text
Student profile
  -> verified opportunity data
  -> deterministic eligibility evaluation
  -> deterministic match/ranking evaluation
  -> structured result for the frontend and AI explanation layer
  -> saved items and application tracking
```

## Non-negotiable Golden Rule

> AI does NOT decide eligibility.

The database and a deterministic, rule-based backend engine are the source of truth. AI may:

- parse a natural-language search query into structured filters;
- turn structured verdicts and score components into user-friendly prose;
- draft application text using only approved, real profile fields.

AI must never determine eligibility, override a failed hard requirement, or run inside the eligibility/match decision path.

## Scope and architecture

Build one hackathon-appropriate backend service. Do not create microservices, a vector database, a message queue, SMS/WhatsApp infrastructure, browser automation, or an autonomous application agent.

The established stack is:

| Concern | Tool |
| --- | --- |
| API backend framework | Next.js 16 App Router Route Handlers + TypeScript |
| Package manager | pnpm |
| Database, authentication, storage, RLS | Supabase + PostgreSQL |
| Runtime input validation | Zod |
| Unit tests | Vitest |
| Deployment target later | Vercel + Supabase |

Use one framework: Next.js. Do not add Express, Fastify, FastAPI, or another service merely for the sake of using another framework.

### What backend owns

- Supabase authentication wiring and session-aware API protection.
- Student profile CRUD: education, skills, languages, experiences, interests, goals, and documents as the schema grows.
- Opportunity retrieval and curator/admin workflows where authorized.
- Deterministic eligibility engine with structured four-state results and “Why not?” blockers.
- Deterministic match engine with transparent score breakdown.
- Structured discovery/search, recommendations, simple priority ordering, and gap analysis.
- Saved opportunities, manual application tracker, private document access, and notification scaffolding.
- RLS-aware data access, tests, migrations, API documentation, and backend documentation.

### Explicitly out of scope

- Frontend screens and Tailwind.
- AI explanation implementation, raw natural-language search parsing, and opportunity scraping/curation pipelines.
- Microservices, vector search, social features, native mobile, SMS/WhatsApp, external-site autofill, and auto-apply agents.

## Existing implementation and important domain rules

The project already includes a deterministic eligibility engine. Do not redesign or weaken it without a concrete reason and tests.

### Hard requirements

These can block eligibility:

- nationality;
- age;
- education level;
- academic year;
- GPA minimum;
- residency;
- required legal authorization;
- deadline.

### Soft requirements

These must not block eligibility. They later influence matching:

- major relevance;
- skills;
- interests;
- goals;
- experience;
- language strength;
- relevant projects;
- academic fit.

### Eligibility verdicts

The engine must always return exactly one of:

| Verdict | Meaning |
| --- | --- |
| `ELIGIBLE` | Official requirements explicitly confirm that the student qualifies. |
| `LIKELY_ELIGIBLE` | Known requirements pass, but some source/profile facts remain uncertain. |
| `UNKNOWN` | Source information cannot confirm or deny qualification. |
| `NOT_ELIGIBLE` | At least one confirmed hard requirement fails. |

For every failure, return structured facts—requirement, required value, actual value, and a stable `messageData.type` code. Do not write an LLM-style explanation in the rule engine.

### Universal opportunity model

Scholarships, internships, hackathons, research, exchanges, training, events, volunteering, and competitions share one opportunity model. Do not make separate eligibility systems by opportunity type.

### Application states

```text
DISCOVERED -> SAVED -> PREPARING -> READY -> SUBMITTED -> ACCEPTED | REJECTED | EXPIRED
```

## Current target-project state

Inspect these files before coding. They establish the patterns you must preserve:

```text
src/app/api/eligibility/evaluate/route.ts
src/lib/eligibility/types.ts
src/lib/eligibility/evaluate.ts
src/lib/eligibility/evaluate.test.ts
src/lib/supabase/client.ts
src/lib/db/profiles.ts
src/lib/db/profiles.test.ts
src/lib/db/opportunities.ts
src/lib/db/opportunities.test.ts
src/lib/db/testing/mock-supabase-client.ts
supabase/migrations/20260906120000_init_schema.sql
supabase/seed.sql
docs/
CHANGES.md
```

Known project state from the previous handoff:

- The pure eligibility engine exists and is tested.
- `POST /api/eligibility/evaluate` validates a profile and hard requirements with Zod, then calls the pure engine.
- A lazy `@supabase/supabase-js` client factory exists.
- Repository functions for profiles and opportunities exist and are tested.
- The migration creates `profiles` and `opportunities` with RLS.
- Opportunities have public read access only. Do not expose opportunity writes through normal student/anonymous routes before a minimal admin-role design exists.
- Seed data contains demo opportunities.
- Before new work, run the project’s checks to establish the real current test count and build state.

## Required code conventions

Follow every rule below exactly.

### 1. Teaching section comments in every source file

Every source file must be divided into named blocks:

```ts
// SECTION: Clear section name
// code...
// End of section: One sentence explaining why this section exists.
```

Use these comments for teaching. After each meaningful code section, explain what it does and why it exists in the end-of-section comment. Keep comments accurate and concise.

### 2. Dependency injection for all Supabase access

Any function that talks to Supabase must accept an optional client as its final argument:

```ts
client: SupabaseClient = getSupabaseClient()
```

Tests must inject the existing mock client from:

```text
src/lib/db/testing/mock-supabase-client.ts
```

Do not create a second mock framework or make real Supabase calls in unit tests.

### 3. Keep database naming isolated

PostgreSQL rows are `snake_case`. Application-facing TypeScript types are `camelCase`.

Perform each conversion inside a repository mapper such as `rowToProfile`; never scatter snake_case mapping through route handlers or business logic.

### 4. Keep Zod aligned with TypeScript

Zod request schemas must mirror their TypeScript interfaces and use `satisfies z.ZodType<TheInterface>` whenever appropriate. This makes TypeScript detect type/schema drift.

### 5. Keep route handlers thin

Route handlers only:

1. Read/validate request data.
2. Call an authentication, repository, or business-logic function from `src/lib/**`.
3. Shape an HTTP response.

Do not place database queries, eligibility rules, matching formulas, or complicated decisions directly in `route.ts`.

### 6. Tests are mandatory

Every new behaviour gets tests.

- Test repositories using the existing injected mock Supabase client.
- Assert both the returned behaviour and query shape through `client.__calls` where that pattern exists.
- Test route handlers by importing their exported `GET`/`POST`/`PUT` function and invoking it with a real `Request`; do not require a running dev server.
- Use deterministic dates in rule tests; do not depend on the current date.

### 7. Documentation is mandatory and simultaneous

For **every new source file**, create a matching Markdown document in `docs/` during the same increment.

For **every source file you meaningfully modify**, update its corresponding Markdown document in `docs/` during the same increment.

Use one Markdown file per source file, with a kebab-case name. For example:

```text
src/lib/auth/getCurrentUser.ts
docs/get-current-user.md
```

The document must explain:

- what the code does;
- why it is structured that way;
- inputs and outputs;
- security implications where relevant;
- how it connects to the rest of NEXTPATH;
- how its tests prove behaviour.

Read existing `docs/*.md` files and match their tone and depth. Explain **why**, not just what.

### 8. Changelog is mandatory for every increment

Append a new dated numbered section to `CHANGES.md` for every completed increment. Follow its existing format. Include:

- what was added or changed;
- why it was needed;
- a **Verification performed** subsection;
- the exact commands run and the real result, including typecheck, test count, and build.

Never claim that a command passed if you did not run it.

### 9. Work in small, verified increments

Implement only one numbered increment at a time. When it is complete:

1. Run `pnpm typecheck`.
2. Run `pnpm test`.
3. Run `pnpm build`.
4. Update matching `docs/` files and `CHANGES.md` with real results.
5. Stop. Summarize what you did, what passed, what users can test manually, and what comes next.

Do not begin the next increment until the user explicitly asks you to continue.

## Next task: implement only Increment 1 — Authentication

Build only the authentication foundation now. Do **not** begin profile routes, opportunity routes, bulk eligibility, matching, ranking, or AI explanations during this increment.

### Goal

Add a small helper such as:

```text
src/lib/auth/getCurrentUser.ts
```

It should read the current request’s Supabase session/JWT and return the authenticated user’s ID, or a clear unauthenticated result that route handlers can turn into HTTP `401`.

### Decision to make and document

Choose the cleanest Next.js App Router approach:

- Supabase SSR/cookie-aware helper, if the frontend uses Supabase Auth session cookies; or
- bearer-token verification from the request’s `Authorization` header, if that is what the existing architecture uses.

Inspect the repository first. Prefer the existing project’s approach. If neither is established, choose one approach, state the assumption prominently in the auth documentation, and make the helper easily adaptable later.

Security requirement: authentication must not merely extract an unverified ID from a header. It must validate the session/JWT through Supabase. The eventual data-access client must preserve the user’s authenticated context so RLS remains effective.

### Required deliverables for this increment

- Auth helper in `src/lib/auth/` with section comments.
- Unit tests for valid user, missing credentials/session, and Supabase verification failure; inject dependencies or client mock so no live project is necessary.
- Documentation file for the auth helper in `docs/`.
- Update any shared Supabase client/factory documentation if you meaningfully change it.
- Dated changelog entry with actual verification results.

### Manual test guidance to include in your final summary

Explain how a teammate can later test authenticated and unauthenticated requests once real Supabase project credentials and a logged-in frontend session exist.

## Future increments — do not implement yet

1. Profile routes:
   - `GET /api/profile`: authenticated student loads only their own profile using `getProfileById`.
   - `PUT /api/profile`: validate with Zod and save using `upsertProfile`.
   - return `401` when unauthenticated.

2. Opportunity routes:
   - `GET /api/opportunities`: use `listOpportunities`.
   - `GET /api/opportunities/:id`: use `getOpportunityById`; return `404` when no record exists.
   - do not expose student-facing POST opportunity creation without minimal admin authorization.

3. Bulk eligibility endpoint:
   - e.g. `GET /api/eligibility/matches`.
   - authenticate the student.
   - load their profile and all opportunities.
   - run the pure `evaluateEligibility` function for each opportunity.
   - return structured results ordered transparently, such as `ELIGIBLE`, `LIKELY_ELIGIBLE`, `UNKNOWN`, then `NOT_ELIGIBLE`.

4. Only after those increments are complete and verified:
   - deterministic match engine for soft requirements;
   - transparent recommendations and priority score;
   - profile gap analysis;
   - saved opportunities, applications, private documents, and notifications;
   - AI explanation adapter that converts stable `messageData.type` codes into prose without deciding eligibility.

## Final response format after each increment

Lead with the outcome. Include:

- files created/changed, linked with absolute paths;
- what the new code does;
- verification commands and exact results;
- manual test steps;
- any assumption or blocker;
- a single sentence stating that you stopped before the next increment.

Do not make external changes, publish deployments, add secrets, or create Supabase projects without explicit user permission.

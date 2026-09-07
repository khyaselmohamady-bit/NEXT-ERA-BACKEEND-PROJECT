# `src/app/api/search/route.ts` and `src/lib/search/*`

The §65 "AI NATURAL-LANGUAGE SEARCH" MVP item. Accepts either structured filter JSON or a natural-language query, returns the database rows that match — never AI-fabricated results.

## Beginner summary

**Two request shapes, one endpoint:**

- **`POST /api/search { filters: { ... } }`** — structured filter search. Always supported. The demo can hit this without an AI provider.
- **`POST /api/search { query: "AI scholarships in Egypt" }`** — natural-language search. Routes through the AI adapter, which extracts structured filters, then runs the same SQL query as the structured path.

If no AI provider is configured, the natural-language path returns **400 `ai_disabled`** with a message telling the caller to use `{ filters: { ... } }`. The structured path always works.

## Why the no-op default

§23 explicitly forbids the AI from inventing opportunities. The MVP's safe default is:

1. The adapter **never** returns opportunity rows — only filter objects.
2. When no AI provider is configured, the adapter returns `{ status: "disabled" }`, and the route returns 400 instead of guessing.

A real AI provider can be wired later by adding an `openRouterAdapter` that implements the same `AiSearchAdapter` interface and returning it from `selectAiAdapter()` when `AI_PROVIDER_API_KEY` is set. **Until then, the no-op adapter is the §65 MVP.**

## Filter shape

```ts
interface SearchFilters {
  query?: string;             // free-text hint matched against title / organization (ilike)
  nationality?: string;       // 2-3 letter country code matched against hard_requirements.nationality.value
  educationLevel?: "SECONDARY" | "DIPLOMA" | "BACHELOR" | "MASTER" | "PHD";
  deadlineBefore?: string;    // YYYY-MM-DD, hard upper bound on hard_requirements.deadline.value
}
```

The shape is intentionally narrow for §65. Adding a filter dimension (e.g. `category`, `field`, `funding`, `location`) is one line in `searchOpportunities` plus a new branch in the Zod schema. Each filter is optional; **at least one** must be present (the route rejects `{ filters: {} }` to prevent unbounded queries).

## SQL construction

`searchOpportunities` chains `.contains`, `.lte`, and `.or` on the PostgREST query:

- **`nationality`** and **`educationLevel`** use `.contains` against the JSONB `hard_requirements` column. PostgREST's `cs` operator checks that the supplied JSON object is contained in the row's JSON.
- **`deadlineBefore`** uses `.lte` against the JSONB-extracted `hard_requirements->deadline->>value` scalar.
- **`query`** uses `.or` with two `ilike` patterns against `title` and `organization`. The adapter is responsible for keeping the hint short so the pattern doesn't blow up.

§23 is satisfied because every result row comes from the database; the AI contributes only filter parameters.

## Adapter interface

```ts
interface AiSearchAdapter {
  parseQuery(query: string): Promise<AiParseResult>;
}

type AiParseResult =
  | { status: "parsed"; filters: SearchFilters }
  | { status: "disabled"; message: string };
```

The route's switch over `result.status` is exhaustive — adding a new outcome later forces every caller to handle it. The no-op adapter's `disabled` response includes a user-safe message the route returns verbatim.

## How its tests prove behaviour

`src/lib/search/aiAdapter.test.ts` (4 tests):

- `noOpAdapter.parseQuery` returns `disabled` for any query
- `selectAiAdapter` returns the no-op adapter when the env var is unset
- `selectAiAdapter` returns the no-op adapter even when the env var is set (real adapter is future work)

`src/app/api/search/route.test.ts` (13 tests):

**Structured path (10 tests):**
- 400 invalid JSON, 400 neither filters nor query, 400 empty filters, 400 both supplied, 400 bad enum, 400 bad date, 400 unknown field, 200 happy, 200 empty, 500 query error

**Natural-language path (3 tests):**
- 400 ai_disabled (with the user-safe message), 400 empty query, 400 query > 500 chars

`src/lib/db/opportunities.ts` — `searchOpportunities(filters, client?)` is the only repository function new to this increment. It accepts the same mock client the other repositories use.

`src/lib/db/testing/mock-supabase-client.ts` — `contains`, `lte`, and `or` added to the chainable method list so the new repository's PostgREST chain is stubbed.

## What's NOT being built

- ❌ Real OpenRouter adapter (no provider API key in `.env.local`; safe-by-default no-op)
- ❌ Pagination — MVP returns the full matching set; a future increment can add `?limit=&offset=`
- ❌ Ranking by match score — the search returns database rows in `created_at desc` order; the §18 match engine ranks inside `/api/match/evaluate` instead
- ❌ Full-text search index — `ilike` is fine for the seeded scale (3 rows) and degrades for thousands
- ❌ Filter dimension expansion (category / field / funding / location) — not §65 MUST; each new dimension is a deliberate addition

## How it connects to the rest of NEXTPATH

- **§22 AI natural-language search** — implemented via the adapter pattern
- **§23 must not search the internet and make up results** — adapter never returns rows, only filters; zero-row result is "no matches found", never hallucinated
- **§40 Discovery page** — the demo's discovery page POSTs to `/api/search` either with structured filters (always works) or with a query string (gated on AI being configured)
- **§65 MVP** — "AI NATURAL-LANGUAGE SEARCH" is now ✓
- **§80 Scene 3 demo** — search runs as part of the AI search scene; when no key is set, the demo clicks through the structured-filter form instead of the NL input
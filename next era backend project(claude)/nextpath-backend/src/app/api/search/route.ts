import { z } from "zod";

import { searchOpportunities } from "@/lib/db/opportunities";
import {
  noOpAdapter,
  type SearchFilters
} from "@/lib/search/aiAdapter";

// SECTION: Response shape
// Discriminated union on `status` so the frontend uses one decoder. The
// `ai_disabled` branch is a 400 — distinct from `no_results` (200 with
// empty array) so the demo can render a "use structured filters"
// message versus a "nothing matched" message.
type SearchResponse =
  | { status: "ok"; items: unknown[]; count: number; source: "structured" | "ai" }
  | { status: "ai_disabled"; message: string }
  | { status: "invalid_request"; message: string; issues?: unknown }
  | { status: "error"; message: string };
// End of section: `source` lets the demo show whether the result came
// from a structured filter or the AI extraction path. `status: "ok"`
// is the only success path, distinct from any failure variant.

// SECTION: Request validation
// The route accepts either { filters: { ... } } (structured) or
// { query: "..." } (natural-language). Exactly one of the two must
// be present; both is rejected at the boundary.
const searchFiltersSchema = z
  .object({
    query: z.string().min(1).max(200).optional(),
    nationality: z.string().min(2).max(3).optional(),
    educationLevel: z
      .enum(["SECONDARY", "DIPLOMA", "BACHELOR", "MASTER", "PHD"])
      .optional(),
    deadlineBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  })
  .strict();

const searchRequestSchema = z
  .union([
    z.object({ filters: searchFiltersSchema }).strict(),
    z.object({ query: z.string().min(1).max(500) }).strict()
  ])
  .refine(
    (value) => {
      if ("filters" in value) {
        // At least one filter field must be present so an empty filters
        // object doesn't degrade to "list everything" silently.
        return Object.keys(value.filters).length > 0;
      }
      return true;
    },
    { message: "Filters object must contain at least one field." }
  );
// End of section: the refine-rule prevents `{ filters: {} }` from
// running an unbounded query. `query` is bounded at 500 chars to
// keep the AI extraction step's prompt size predictable.

// SECTION: POST handler
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "invalid_request", message: "Request body must be valid JSON." } satisfies SearchResponse,
      { status: 400 }
    );
  }

  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        status: "invalid_request",
        message: "Body must be { filters: { ... } } or { query: '...' }.",
        issues: parsed.error.issues
      } satisfies SearchResponse,
      { status: 400 }
    );
  }

  // SECTION: Resolve filters
  let filters: SearchFilters;
  let source: "structured" | "ai";

  if ("filters" in parsed.data) {
    filters = parsed.data.filters as SearchFilters;
    source = "structured";
  } else {
    // Natural-language form: route through the AI adapter.
    const adapter = noOpAdapter;
    const result = await adapter.parseQuery(parsed.data.query);
    if (result.status === "disabled") {
      return Response.json(
        { status: "ai_disabled", message: result.message } satisfies SearchResponse,
        { status: 400 }
      );
    }
    filters = result.filters;
    source = "ai";
  }
  // End of section: the AI path is short-circuited by the no-op
  // adapter's `disabled` response. A future real adapter's `parsed`
  // response would have its filters fed straight into the SQL
  // builder.

  // SECTION: Run the search
  try {
    const items = await searchOpportunities(filters);
    return Response.json(
      { status: "ok", items, count: items.length, source } satisfies SearchResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to search opportunities.";
    return Response.json(
      { status: "error", message } satisfies SearchResponse,
      { status: 500 }
    );
  }
  // End of section: zero matches is 200 with `items: []` and `count: 0`
  // — NOT an error. §23 is satisfied because the database is the
  // only thing that decides what matches; the AI never contributes
  // opportunity rows to the response.
}
// End of section: the route is intentionally thin. All search logic
// lives in the adapter (filter extraction) and the repository
// (PostgREST query construction).
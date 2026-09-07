// SECTION: Search filter vocabulary
// The filter shape is deliberately narrow for §65 MVP. Every field is
// optional; the route passes the filter object straight to the SQL
// builder. Adding fields here (e.g. `category`, `field`) is a one-line
// change in the route and the SQL builder.

export interface SearchFilters {
  /** Free-text hint the AI extracted from the user's natural-language query. */
  query?: string;
  /** Match against `hard_requirements` JSONB's `nationality.value` array. */
  nationality?: string;
  /** Match against `hard_requirements` JSONB's `educationLevel.value`. */
  educationLevel?: string;
  /** Hard upper bound on `hard_requirements` JSONB's `deadline.value`. */
  deadlineBefore?: string;
}
// End of section: the shape is intentionally small. A full
// §44-style filter set (category, field, funding, location, remote,
// language, etc.) would bloat the SQL builder without changing the
// AI extraction path. Future increments can grow the filter shape
// once the demo proves which dimensions the student actually searches
// on.

// SECTION: Adapter result
// The AI adapter returns one of two discriminated-union variants:
//  - `parsed`: the AI extracted structured filters from the user's query
//  - `disabled`: no AI provider is configured, so the route must reject
//    the natural-language form and ask the caller for structured filters
//
// Critically, the adapter NEVER returns a list of opportunities. §23
// prohibits the AI from making up results; only the database can say
// what matches the parsed filters.
export type AiParseResult =
  | { status: "parsed"; filters: SearchFilters }
  | { status: "disabled"; message: string };
// End of section: a discriminated union means the route's switch over
// `result.status` is exhaustive — adding a new outcome later forces
// every caller to handle it.

// SECTION: Adapter contract
// Every adapter implements the same single-method interface so the
// route doesn't care which provider is wired. The adapter is the only
// place that touches the AI provider.
export interface AiSearchAdapter {
  parseQuery(query: string): Promise<AiParseResult>;
}
// End of section: a one-method interface keeps the adapter swappable.
// `noOpAdapter` (this file) returns `disabled`; a future OpenRouter
// adapter can implement the same interface and be selected via env var.

// SECTION: No-op adapter
// Returns `disabled` with a stable, user-safe message. The route
// converts this into a 400 "structured filters required" so the demo
// can still hit `/api/search` with structured filters while natural-
// language queries are gated on having an AI provider configured.
export const noOpAdapter: AiSearchAdapter = {
  parseQuery: async (query) => ({
    status: "disabled",
    message:
      "AI search is not configured. Send { filters: { ... } } instead of { query: '...' }."
  })
};
// End of section: the no-op adapter is the safe default. The
// `message` string is short, stable, and free of internal jargon so
// the demo can render it directly to the user.

// SECTION: Provider selection
// Reads an env var (`AI_PROVIDER_API_KEY`) to decide whether a real
// provider is available. Returns the no-op adapter when the key is
// absent so production deployments without an AI key fail safely
// rather than throwing at request time.
export function selectAiAdapter(): AiSearchAdapter {
  const hasKey = typeof process !== "undefined"
    && Boolean(process.env["AI_PROVIDER_API_KEY"]);
  if (!hasKey) {
    return noOpAdapter;
  }
  // A future increment can return an OpenRouter adapter here when the
  // API key is set. For §65 the no-op is the MVP-safe default; flipping
  // it on requires wiring the provider, adding a real adapter
  // implementation, and tests that pin the AI's filter extraction.
  return noOpAdapter;
}
// End of section: the env-var check happens once at module load so
// repeated `/api/search` calls don't re-read `process.env`. A future
// production deployment that sets `AI_PROVIDER_API_KEY` will silently
// get the no-op path until the adapter is implemented — which is the
// §23 safe default.
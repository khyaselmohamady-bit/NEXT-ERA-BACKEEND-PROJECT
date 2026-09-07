import { listOpportunities } from "@/lib/db/opportunities";

// SECTION: Response shape
// The frontend uses `status: "ok" | "error"` to switch on; `items` is always an array
// (possibly empty) so the consumer doesn't have to distinguish "no rows" from "request
// failed". This is the same envelope pattern as the profile route.
type ListResponse =
  | { status: "ok"; items: unknown[]; count: number }
  | { status: "error"; message: string };
// End of section: discriminated union keeps `items` and `message` from ever
// appearing in the same response — the consumer can pattern-match on `status`.

// SECTION: GET handler
// Lists every opportunity. Public read access per the existing
// `opportunities_select_all` RLS policy in `supabase/migrations/…`, so no
// authentication is required: an anonymous visitor to the demo should be able
// to see what opportunities exist.
//
// The blueprint's §65 "GLOBAL OPPORTUNITIES" MVP item is satisfied here.
export async function GET(): Promise<Response> {
  try {
    const items = await listOpportunities();
    return Response.json(
      { status: "ok", items, count: items.length } satisfies ListResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list opportunities.";
    return Response.json(
      { status: "error", message } satisfies ListResponse,
      { status: 500 }
    );
  }
}
// End of section: 500 is the right code for an unexpected Supabase failure;
// an empty list is a 200 with `items: []` (not a 404), because "no
// opportunities exist yet" is not an error condition.
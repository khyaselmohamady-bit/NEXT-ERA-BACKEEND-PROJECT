import { getOpportunityById } from "@/lib/db/opportunities";

// SECTION: Response shape
// Same envelope as the list route: a discriminated union on `status` so the
// frontend can switch on it without inspecting HTTP status codes.
type GetResponse =
  | { status: "ok"; opportunity: unknown }
  | { status: "not_found"; message: string }
  | { status: "error"; message: string };
// End of section: the three states are mutually exclusive. `not_found` is
// distinct from `error` because the former is a normal outcome (no row with
// that id) while the latter signals an unexpected Supabase failure.

// SECTION: Context typing
// Next.js 16's dynamic route params are a Promise — see
// `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`.
// We type the context explicitly so the build catches any future change.
type Context = { params: Promise<{ id: string }> };
// End of section: the explicit type replaces what `RouteContext` provides, so
// this file has no implicit global-type dependency.

// SECTION: GET handler
// Returns one opportunity by id. Public read access (matching the list route)
// so an anonymous visitor can deep-link to an opportunity. Returns 404 when no
// row matches the id, per the blueprint's §49 spec.
export async function GET(
  _request: Request,
  context: Context
): Promise<Response> {
  const { id } = await context.params;

  try {
    const opportunity = await getOpportunityById(id);
    if (!opportunity) {
      return Response.json(
        { status: "not_found", message: `No opportunity found with id ${id}.` } satisfies GetResponse,
        { status: 404 }
      );
    }
    return Response.json(
      { status: "ok", opportunity } satisfies GetResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load opportunity.";
    return Response.json(
      { status: "error", message } satisfies GetResponse,
      { status: 500 }
    );
  }
}
// End of section: 404 is reserved for "no such id". 500 means a real
// Supabase failure. Both are distinct from the `200 ok` happy path so the
// frontend can render each correctly.
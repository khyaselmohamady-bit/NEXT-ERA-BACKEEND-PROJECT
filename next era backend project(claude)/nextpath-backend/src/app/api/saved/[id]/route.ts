import {
  getCurrentUser,
  type GetCurrentUserResult
} from "@/lib/auth/getCurrentUser";
import { unsaveOpportunity } from "@/lib/db/saved";

// SECTION: Test-only authentication seam
// Mirrors the GET/POST seam in `src/app/api/saved/route.ts`.
type Authenticate = (request: Request) => Promise<GetCurrentUserResult>;

let testAuthenticate: Authenticate | null = null;

export function __setTestAuthenticate(impl: Authenticate | null): void {
  testAuthenticate = impl;
}

async function authenticate(request: Request): Promise<GetCurrentUserResult> {
  if (testAuthenticate) {
    return testAuthenticate(request);
  }
  return getCurrentUser(request);
}
// End of section: same pattern as the list/create route.

// SECTION: Response shape
type DeleteResponse =
  | { status: "ok"; message: string }
  | { status: "unauthenticated"; message: string }
  | { status: "error"; message: string };
// End of section: a successful delete returns 200 (not 204) so the body
// carries a message the demo can display ("Removed from saved list.").

// SECTION: Context typing
// The dynamic route parameter is the opportunity id (UUID), matching the
// path used by the list/create route's POST body.
type Context = { params: Promise<{ id: string }> };
// End of section: explicit type replaces `RouteContext` so this file has
// no implicit dependency on Next.js globals.

// SECTION: DELETE handler
// Removes a saved opportunity for the authenticated student. The `:id` in
// the URL is the *opportunity* id (not the saved-row id), so the frontend
// can wire its "remove" button directly from a saved-opportunities list.
export async function DELETE(
  request: Request,
  context: Context
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies DeleteResponse,
      { status: 401 }
    );
  }

  const { id } = await context.params;

  try {
    await unsaveOpportunity(auth.userId, id, auth.client);
    return Response.json(
      { status: "ok", message: "Removed from saved list." } satisfies DeleteResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove saved opportunity.";
    return Response.json(
      { status: "error", message } satisfies DeleteResponse,
      { status: 500 }
    );
  }
}
// End of section: 200 means the delete completed. Whether a row actually
// existed is irrelevant — idempotent deletes keep the client simple
// (no need to differentiate "removed" from "was never there").
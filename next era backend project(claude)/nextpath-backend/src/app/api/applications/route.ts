import { z } from "zod";

import {
  getCurrentUser,
  type GetCurrentUserResult
} from "@/lib/auth/getCurrentUser";
import {
  createApplication,
  listApplicationsByUser,
  type ApplicationWithOpportunity
} from "@/lib/db/applications";
import {
  DEFAULT_INITIAL_STATE,
  type ApplicationState
} from "@/lib/applications/stateMachine";

// SECTION: Test-only authentication seam
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
// End of section: same pattern as /api/profile and /api/saved.

// SECTION: Response shapes
type ListResponse =
  | { status: "ok"; items: ApplicationWithOpportunity[]; count: number }
  | { status: "unauthenticated"; message: string };

type CreateResponse =
  | { status: "ok"; application: import("@/lib/db/applications").Application }
  | { status: "unauthenticated"; message: string }
  | { status: "invalid_request"; message: string; issues?: unknown }
  | { status: "already_tracked"; message: string }
  | { status: "error"; message: string };
// End of section: `invalid_request` covers 400 paths, `already_tracked`
// is a 409 for the unique constraint violation, `error` is a 500.

// SECTION: POST request validation
// The eight §37 states are accepted as initial states. `DISCOVERED` is
// allowed because a row may be created in DISCOVERED by an ingestion
// job that hasn't been built yet — but the route's default for
// human-initiated creates is `SAVED` (see `DEFAULT_INITIAL_STATE`).
const applicationStateSchema = z.enum([
  "DISCOVERED",
  "SAVED",
  "PREPARING",
  "READY",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED"
]);

const createBodySchema = z
  .object({
    opportunityId: z.string().uuid(),
    initialState: applicationStateSchema.optional()
  })
  .strict();
// End of section: `.strict()` rejects unknown fields early. The
// `z.string().uuid()` constraint matches the `opportunities.id` primary
// key so a typo at the boundary fails fast.

// SECTION: GET handler
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies ListResponse,
      { status: 401 }
    );
  }

  try {
    const items = await listApplicationsByUser(auth.userId, auth.client);
    return Response.json(
      { status: "ok", items, count: items.length } satisfies ListResponse,
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list applications.";
    return Response.json(
      { status: "error", message } satisfies { status: "error"; message: string },
      { status: 500 }
    );
  }
}
// End of section: empty list is 200 with `items: []`, matching the
// /api/opportunities and /api/saved envelope. "You haven't started any
// applications yet" is not an error condition.

// SECTION: POST handler
export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies CreateResponse,
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "invalid_request", message: "Request body must be valid JSON." } satisfies CreateResponse,
      { status: 400 }
    );
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        status: "invalid_request",
        message: "Body must include { opportunityId: <uuid> } and may include { initialState: <state> }.",
        issues: parsed.error.issues
      } satisfies CreateResponse,
      { status: 400 }
    );
  }

  const initialState: ApplicationState =
    (parsed.data.initialState as ApplicationState | undefined) ??
    DEFAULT_INITIAL_STATE;

  try {
    const application = await createApplication(
      auth.userId,
      parsed.data.opportunityId,
      initialState,
      auth.client
    );
    return Response.json(
      { status: "ok", application } satisfies CreateResponse,
      { status: 201 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create application.";
    if (/duplicate key/i.test(message)) {
      return Response.json(
        { status: "already_tracked", message: "You are already tracking this opportunity." } satisfies CreateResponse,
        { status: 409 }
      );
    }
    if (/foreign key/i.test(message)) {
      return Response.json(
        { status: "invalid_request", message: `Opportunity ${parsed.data.opportunityId} does not exist.` } satisfies CreateResponse,
        { status: 400 }
      );
    }
    return Response.json(
      { status: "error", message } satisfies CreateResponse,
      { status: 500 }
    );
  }
}
// End of section: error mapping mirrors /api/saved — duplicate keys
// become 409, foreign-key violations become 400, anything else is 500.
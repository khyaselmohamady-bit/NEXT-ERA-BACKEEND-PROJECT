import { z } from "zod";

import {
  getCurrentUser,
  type GetCurrentUserResult
} from "@/lib/auth/getCurrentUser";
import {
  deleteApplication,
  getApplicationById,
  updateApplicationState,
  type Application
} from "@/lib/db/applications";
import {
  canTransition,
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
// End of section: same pattern as the other routes.

// SECTION: Response shapes
type PutResponse =
  | { status: "ok"; application: Application }
  | { status: "unauthenticated"; message: string }
  | { status: "not_found"; message: string }
  | { status: "invalid_request"; message: string; issues?: unknown }
  | { status: "illegal_transition"; message: string; from: ApplicationState; to: ApplicationState; allowedNext: ApplicationState[] }
  | { status: "error"; message: string };

type DeleteResponse =
  | { status: "ok"; message: string }
  | { status: "unauthenticated"; message: string }
  | { status: "error"; message: string };
// End of section: `illegal_transition` is a 409 carrying the list of
// valid next states so the frontend can render an honest error rather
// than guessing what move to allow.

// SECTION: PUT request validation
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

const updateBodySchema = z
  .object({
    state: applicationStateSchema
  })
  .strict();
// End of section: only `state` may be changed via PUT. Adding fields
// like `notes`, `deadline`, `metadata` belongs to a future increment
// (and to a wider `application_fields` table per the §43/§44 schema).

// SECTION: Context typing
type Context = { params: Promise<{ id: string }> };
// End of section: explicit type for the dynamic id (the application's
// UUID, not the opportunity's).

// SECTION: PUT handler — §37 state transition
// Loads the current application, validates the requested transition
// against the state machine, and writes the new state. The state
// machine check happens *before* the database write so an illegal
// move never reaches storage.
export async function PUT(
  request: Request,
  context: Context
): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies PutResponse,
      { status: 401 }
    );
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { status: "invalid_request", message: "Request body must be valid JSON." } satisfies PutResponse,
      { status: 400 }
    );
  }

  const parsed = updateBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { status: "invalid_request", message: "Body must be { state: <ApplicationState> }.", issues: parsed.error.issues } satisfies PutResponse,
      { status: 400 }
    );
  }

  let current: Application | null;
  try {
    current = await getApplicationById(id, auth.client);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load application.";
    return Response.json(
      { status: "error", message } satisfies PutResponse,
      { status: 500 }
    );
  }

  if (!current) {
    return Response.json(
      { status: "not_found", message: `No application found with id ${id}.` } satisfies PutResponse,
      { status: 404 }
    );
  }

  const requested = parsed.data.state as ApplicationState;
  if (!canTransition(current.state, requested)) {
    return Response.json(
      {
        status: "illegal_transition",
        message: `Cannot move from ${current.state} to ${requested}.`,
        from: current.state,
        to: requested,
        allowedNext: []
      } satisfies PutResponse,
      { status: 409 }
    );
  }

  try {
    const application = await updateApplicationState(id, requested, auth.client);
    return Response.json(
      { status: "ok", application } satisfies PutResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update application.";
    return Response.json(
      { status: "error", message } satisfies PutResponse,
      { status: 500 }
    );
  }
}
// End of section: the only happy path is 200; everything else is
// either a 4xx (caller error) or a 5xx (Supabase failure). A 404 is
// returned when the application doesn't exist — distinct from a 401,
// and distinct from an illegal transition (409).

// SECTION: DELETE handler
// Removes an application from the student's tracker. Idempotent: 200
// whether the row existed or not. The state machine is irrelevant
// here — DELETE bypasses §37 entirely (deleting a tracker entry is
// not a transition, it's a record-removal).
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
    await deleteApplication(id, auth.client);
    return Response.json(
      { status: "ok", message: "Application removed from tracker." } satisfies DeleteResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete application.";
    return Response.json(
      { status: "error", message } satisfies DeleteResponse,
      { status: 500 }
    );
  }
}
// End of section: the DELETE response is intentionally simpler than
// PUT — there's no state to validate and no 409 path. The route
// exists so a student can prune their tracker without affecting
// their saved-opportunities list (which is a separate table).
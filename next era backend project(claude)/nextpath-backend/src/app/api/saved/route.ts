import { z } from "zod";

import {
  getCurrentUser,
  type GetCurrentUserResult
} from "@/lib/auth/getCurrentUser";
import {
  listSavedByUser,
  saveOpportunity,
  type SavedOpportunity,
  type SavedRowOnly
} from "@/lib/db/saved";

// SECTION: Test-only authentication seam
// Mirrors the seam introduced by `src/app/api/profile/route.ts` so route
// tests can inject a fake `getCurrentUser` without spinning up a live
// Supabase project. The module-level mutable reference is reset to `null`
// after each test by the test suite's `afterEach`.
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
// End of section: the only place in this file that knows about Next.js
// runtime behaviour. Production never calls `__setTestAuthenticate`.

// SECTION: Response shapes
// Discriminated unions so the frontend can switch on `status` without
// inspecting HTTP codes. `SavedResponse` is shared between both methods
// so the client uses one decoder.
type ListResponse =
  | { status: "ok"; items: SavedOpportunity[]; count: number }
  | { status: "unauthenticated"; message: string };

type CreateResponse =
  | { status: "ok"; saved: SavedRowOnly }
  | { status: "unauthenticated"; message: string }
  | { status: "invalid_opportunity"; message: string; issues?: unknown }
  | { status: "already_saved"; message: string }
  | { status: "error"; message: string };
// End of section: the four states are mutually exclusive. `unauthenticated`
// (401) is distinct from `invalid_opportunity` (400) and `already_saved`
// (409), so the demo can render each correctly.

// SECTION: POST request validation
const saveBodySchema = z
  .object({
    opportunityId: z.string().uuid()
  })
  .strict();
// End of section: `.strict()` rejects unknown fields early; the
// `z.string().uuid()` constraint matches the `opportunities.id` primary
// key so a typo at the boundary fails fast.

// SECTION: GET handler
// Lists the authenticated student's saved opportunities. Each item carries
// the full Opportunity payload (from the existing repository), so the
// frontend renders a saved-opportunities page without a second round-trip
// per card.
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies ListResponse,
      { status: 401 }
    );
  }

  try {
    const items = await listSavedByUser(auth.userId, auth.client);
    return Response.json(
      { status: "ok", items, count: items.length } satisfies ListResponse,
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list saved opportunities.";
    return Response.json(
      { status: "error", message } satisfies { status: "error"; message: string },
      { status: 500 }
    );
  }
}
// End of section: empty list is 200 with `items: []`, matching the existing
// /api/opportunities contract — "you haven't saved anything yet" is not an
// error condition, it's a normal state.

// SECTION: POST handler
// Saves an opportunity for the authenticated student. Validates the body,
// then inserts via the repository. The FK constraint rejects unknown
// opportunity ids (turning them into 400 invalid_opportunity) and the
// unique (user_id, opportunity_id) constraint rejects duplicates (turning
// them into 409 already_saved).
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
      { status: "invalid_opportunity", message: "Request body must be valid JSON." } satisfies CreateResponse,
      { status: 400 }
    );
  }

  const parsed = saveBodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { status: "invalid_opportunity", message: "Body must be { opportunityId: <uuid> }.", issues: parsed.error.issues } satisfies CreateResponse,
      { status: 400 }
    );
  }

  try {
    const saved = await saveOpportunity(auth.userId, parsed.data.opportunityId, auth.client);
    return Response.json(
      { status: "ok", saved } satisfies CreateResponse,
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save opportunity.";
    // PostgREST surfaces foreign-key violations as messages containing
    // "violates foreign key" and unique-constraint violations as messages
    // containing "duplicate key". The exact wording matches Postgres
    // 13+/14+ error phrasing.
    if (/duplicate key/i.test(message)) {
      return Response.json(
        { status: "already_saved", message: "This opportunity is already in your saved list." } satisfies CreateResponse,
        { status: 409 }
      );
    }
    if (/foreign key/i.test(message)) {
      return Response.json(
        { status: "invalid_opportunity", message: `Opportunity ${parsed.data.opportunityId} does not exist.` } satisfies CreateResponse,
        { status: 400 }
      );
    }
    return Response.json(
      { status: "error", message } satisfies CreateResponse,
      { status: 500 }
    );
  }
}
// End of section: the only HTTP code that distinguishes a duplicate save
// from a real failure is 409. Everything else is a 500. The 201 status on
// success matches REST convention for a created resource.
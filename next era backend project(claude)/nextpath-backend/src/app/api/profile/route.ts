import { z } from "zod";

import {
  getCurrentUser,
  type GetCurrentUserResult
} from "@/lib/auth/getCurrentUser";
import {
  getFullProfileById,
  upsertProfile,
  upsertSoftFacts
} from "@/lib/db/profiles";

// SECTION: Shared enum
// The education-level union is small enough to inline here as well as in the
// eligibility-evaluate route; both definitions must stay in lock-step, so a
// future increment will lift them into a single `src/lib/eligibility/zodSchemas.ts`
// module once a third consumer appears.
const educationLevelSchema = z.enum([
  "SECONDARY",
  "DIPLOMA",
  "BACHELOR",
  "MASTER",
  "PHD"
]);
// End of section: keeping the definition adjacent to the route today avoids
// creating a one-call-site module; the comment above is the contract for the
// future refactor.

// SECTION: Response shape
// The handler returns a typed JSON envelope so the frontend can switch on `status`
// without having to inspect HTTP codes. Keeping both branches shaped identically
// (always `{ status, profile | message }`) means clients can render either state
// from a single decoder. After increment 6 the `profile` is the full row split
// into `eligibility` and `match` halves so the frontend doesn't have to keep two
// separate GETs in sync.
type ProfileRouteResponse =
  | {
      status: "ok";
      profile: {
        eligibility: import("@/lib/eligibility/types").EligibilityProfile | null;
        match: import("@/lib/match/types").MatchProfile;
      } | null;
    }
  | { status: "unauthenticated"; message: string };
// End of section: a discriminated union on `status` makes the two outcomes
// impossible to confuse — the frontend cannot accidentally read `profile` on an
// unauthenticated response because the type does not exist there.

// SECTION: PUT request validation
// Mirrors `EligibilityProfile` in `src/lib/eligibility/types.ts` field-for-field.
// Every field is optional because a student may submit an incomplete profile,
// and `.strict()` rejects unexpected fields early. The refine-rule prevents
// empty `PUT` bodies (which would silently succeed and teach the frontend
// nothing useful about whether the call actually did anything).
//
// Increment 6 added the soft-facts half of the profile (MatchProfile from
// `src/lib/match/types.ts`). Eligibility facts are validated by the schema
// below; soft facts are validated by a sibling schema and merged into the
// PUT pipeline so a single PUT can update both halves of the row.
const languageTupleSchema = z.object({
  language: z.string().min(2),
  level: z.string().min(1)
});

const softFactsUpdateSchema = z
  .object({
    major: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    goals: z.array(z.string()).optional(),
    experience: z.array(z.string()).optional(),
    languages: z.array(languageTupleSchema).optional(),
    academicFit: z.array(z.string()).optional()
  })
  .strict();

const profileUpdateSchema = z
  .object({
    nationalityCode: z.string().min(2).max(3).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    educationLevel: educationLevelSchema.optional(),
    academicYear: z.number().int().min(1).max(10).optional(),
    gpa: z.number().min(0).max(5).optional(),
    residencyCountryCode: z.string().min(2).max(3).optional(),
    hasRequiredLegalAuthorization: z.boolean().optional(),
    softFacts: softFactsUpdateSchema.optional()
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Profile update must contain at least one field."
  });
// End of section: a plain `z.object` here keeps the schema independent of the
// `EligibilityProfile` type. The strict-fields guarantee and the non-empty
// refine are the real safety; if `EligibilityProfile` later adds a new field,
// the route stays decoupled until the schema is deliberately updated.

// SECTION: Test-only authentication seam
// Production code calls `getCurrentUser` directly. Tests need to skip the
// real Supabase auth round-trip and substitute a fake result, so we let a
// test-only hook swap in a custom authenticator. The module-level mutable
// reference is reset to `null` after each test by the test suite's `afterEach`,
// so the production path is never accidentally overridden across runs.
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
// End of section: a single test-only export keeps Next.js's route-handler
// signature untouched (which is mandatory — Next passes a context object as the
// second argument, so positional injection would break). Tests can still inject
// behaviour without spinning up a live Supabase project.

// SECTION: GET handler
// Loads the authenticated student's full profile (eligibility + match halves).
// Uses the per-request Supabase client returned by `getCurrentUser`, so every
// query carries the user's JWT and the existing `auth.uid() = id` RLS policy
// on `profiles` actually gates the read.
export async function GET(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies ProfileRouteResponse,
      { status: 401 }
    );
  }

  const full = await getFullProfileById(auth.userId, auth.client);
  if (!full) {
    return Response.json(
      { status: "ok", profile: null } satisfies ProfileRouteResponse,
      { status: 200 }
    );
  }
  return Response.json(
    {
      status: "ok",
      profile: { eligibility: full.eligibility, match: full.match }
    } satisfies ProfileRouteResponse,
    { status: 200 }
  );
}
// End of section: a `null` profile (student has never filled one out) is a
// normal `200 ok` response with `profile: null` — not an error. The frontend
// uses that signal to decide whether to show an empty-profile form.

// SECTION: PUT handler
// Validates the request body with Zod, then upserts via the repository.
// Both halves of the profile (eligibility and soft facts) are merged with the
// existing row and written in two upserts — see `upsertFullProfile` for the
// reason we don't use one here.
export async function PUT(request: Request): Promise<Response> {
  const auth = await authenticate(request);
  if (auth.status !== "authenticated") {
    return Response.json(
      { status: "unauthenticated", message: auth.message } satisfies ProfileRouteResponse,
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_profile", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  // Fetching before upserting lets the repository keep its single
  // full-row contract while this handler accepts partial updates.
  // The repository's row mappers already convert nulls to undefined,
  // so the merge below is field-by-field safe.
  const existing = await getFullProfileById(auth.userId, auth.client);
  const { softFacts, ...eligibilityPatch } = parsed.data;

  const mergedEligibility = {
    ...(existing?.eligibility ?? {}),
    ...eligibilityPatch
  };
  await upsertProfile(auth.userId, mergedEligibility, auth.client);

  if (softFacts) {
    const mergedSoftFacts = { ...(existing?.match ?? {}), ...softFacts };
    await upsertSoftFacts(auth.userId, mergedSoftFacts, auth.client);
  }

  const refreshed = await getFullProfileById(auth.userId, auth.client);
  if (!refreshed) {
    // The row existed before we wrote it; if it's missing now something
    // upstream deleted it. Surface that as a 500 instead of returning a
    // misleading `profile: null`.
    return Response.json(
      { error: "profile_missing_after_write", message: "Profile row disappeared after write." },
      { status: 500 }
    );
  }
  return Response.json(
    {
      status: "ok",
      profile: { eligibility: refreshed.eligibility, match: refreshed.match }
    } satisfies ProfileRouteResponse,
    { status: 200 }
  );
}
// End of section: returning the refreshed profile (rather than just `{ ok: true }`)
// means the demo scene "Create student" can render the saved state immediately
// without a follow-up `GET` round-trip.
import { z } from "zod";

import { evaluateMatch } from "@/lib/match/evaluate";
import type { MatchOpportunity, MatchProfile } from "@/lib/match/types";

// SECTION: Request validation
// Mirrors the `MatchProfile` and `MatchOpportunity` shapes from
// `src/lib/match/types.ts`. Every field is optional because either side may
// have nothing to score with — the engine treats empty objects as "no data"
// and returns UNKNOWN rather than fabricating a score.
const languageTupleSchema = z.object({
  language: z.string().min(2),
  level: z.string().min(1)
});

const matchProfileSchema = z
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

const matchOpportunitySchema = z
  .object({
    preferredMajors: z.array(z.string()).optional(),
    preferredSkills: z.array(z.string()).optional(),
    preferredInterests: z.array(z.string()).optional(),
    preferredGoals: z.array(z.string()).optional(),
    preferredExperience: z.array(z.string()).optional(),
    preferredLanguages: z.array(languageTupleSchema).optional(),
    preferredAcademicFit: z.array(z.string()).optional()
  })
  .strict();

const matchRequestSchema = z
  .object({
    profile: matchProfileSchema,
    opportunity: matchOpportunitySchema
  })
  .strict();
// End of section: `.strict()` rejects unexpected fields at the boundary. The
// route does not authenticate or hit the database — the caller's profile is
// already loaded from /api/profile and the opportunity soft facts are taken
// straight from /api/opportunities. No bearer check is required here, which
// keeps this route cheap to call from the demo's match-score widget.

// SECTION: POST handler
// Validates the request body with Zod and delegates to the pure engine.
// Returns the engine's structured breakdown so the frontend can render the
// "93% match — Major 20/20, Skills 18/20, …" widget from the blueprint's
// §18 example.
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = matchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_match_request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const result = evaluateMatch(
    parsed.data.profile as MatchProfile,
    parsed.data.opportunity as MatchOpportunity
  );

  return Response.json(
    { status: "ok", result } satisfies { status: "ok"; result: unknown },
    { status: 200 }
  );
}
// End of section: the response envelope mirrors the eligibility-evaluate
// route's `{ status: "ok", result }` shape, so the frontend uses one decoder
// for both routes. The engine itself is the only thing this route does.
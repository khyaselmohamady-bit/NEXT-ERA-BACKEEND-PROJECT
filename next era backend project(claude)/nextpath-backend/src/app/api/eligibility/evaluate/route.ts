import { z } from "zod";

import { evaluateEligibility } from "@/lib/eligibility/evaluate";
import type { EligibilityProfile, OpportunityHardRequirements } from "@/lib/eligibility/types";

// SECTION: Request validation
// Mirrors the shared TypeScript contracts in types.ts so a malformed request fails
// validation here instead of reaching the pure engine with the wrong shape.
function requirementSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.discriminatedUnion("sourceStatus", [
    z.object({ sourceStatus: z.literal("EXPLICIT"), value: valueSchema }),
    z.object({ sourceStatus: z.literal("AMBIGUOUS"), note: z.string().optional() }),
    z.object({ sourceStatus: z.literal("NOT_STATED") })
  ]);
}

const educationLevelSchema = z.enum(["SECONDARY", "DIPLOMA", "BACHELOR", "MASTER", "PHD"]);

const profileSchema = z.object({
  nationalityCode: z.string().optional(),
  birthDate: z.string().optional(),
  educationLevel: educationLevelSchema.optional(),
  academicYear: z.number().optional(),
  gpa: z.number().optional(),
  residencyCountryCode: z.string().optional(),
  hasRequiredLegalAuthorization: z.boolean().optional()
}) satisfies z.ZodType<EligibilityProfile>;

const requirementsSchema = z.object({
  nationality: requirementSchema(z.array(z.string())),
  age: requirementSchema(
    z.object({ minimum: z.number().optional(), maximum: z.number().optional() })
  ),
  educationLevel: requirementSchema(z.array(educationLevelSchema)),
  academicYear: requirementSchema(z.array(z.number())),
  minimumGpa: requirementSchema(z.number()),
  residency: requirementSchema(z.array(z.string())),
  requiresLegalAuthorization: requirementSchema(z.literal(true)),
  deadline: requirementSchema(z.string())
}) satisfies z.ZodType<OpportunityHardRequirements>;

const requestSchema = z.object({
  profile: profileSchema,
  requirements: requirementsSchema,
  asOf: z.string().optional()
});
// End of section: any request that doesn't match these shapes is rejected with a 400 before evaluateEligibility ever runs.

// SECTION: Eligibility evaluation endpoint
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (body === null) {
    return Response.json({ error: "invalid_json_body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_request_shape", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { profile, requirements, asOf } = parsed.data;
  const parsedAsOf = asOf ? new Date(asOf) : undefined;

  if (asOf && Number.isNaN(parsedAsOf?.getTime())) {
    return Response.json({ error: "invalid_as_of_date" }, { status: 400 });
  }

  const result = evaluateEligibility(profile, requirements, parsedAsOf);
  return Response.json(result);
}
// End of section: this is the only network-facing entry point into the pure engine; validation lives here, the decision logic stays untouched in evaluate.ts.

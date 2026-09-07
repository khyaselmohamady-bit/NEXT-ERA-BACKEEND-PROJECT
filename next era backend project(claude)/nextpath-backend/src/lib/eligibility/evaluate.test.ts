import { describe, expect, it } from "vitest";

import { evaluateEligibility } from "./evaluate";
import type { EligibilityProfile, OpportunityHardRequirements } from "./types";

// End of section: tests import the pure function and its contracts without starting a server or connecting to a database.

// SECTION: Reusable test fixtures
const asOf = new Date("2026-09-06T00:00:00.000Z");

const eligibleProfile: EligibilityProfile = {
  nationalityCode: "EG",
  birthDate: "2004-06-01",
  educationLevel: "BACHELOR",
  academicYear: 2,
  gpa: 3.5,
  residencyCountryCode: "EG",
  hasRequiredLegalAuthorization: true
};

const explicitRequirements: OpportunityHardRequirements = {
  nationality: { sourceStatus: "EXPLICIT", value: ["EG"] },
  age: { sourceStatus: "EXPLICIT", value: { minimum: 18, maximum: 30 } },
  educationLevel: { sourceStatus: "EXPLICIT", value: ["BACHELOR"] },
  academicYear: { sourceStatus: "EXPLICIT", value: [2, 3, 4] },
  minimumGpa: { sourceStatus: "EXPLICIT", value: 3.2 },
  residency: { sourceStatus: "EXPLICIT", value: ["EG"] },
  requiresLegalAuthorization: { sourceStatus: "EXPLICIT", value: true },
  deadline: { sourceStatus: "EXPLICIT", value: "2026-12-01" }
};
// End of section: fixtures make each test easy to read because only the fact being tested needs to change.

// SECTION: Eligibility verdict tests
describe("evaluateEligibility", () => {
  it("returns ELIGIBLE when every explicit hard requirement passes", () => {
    const result = evaluateEligibility(eligibleProfile, explicitRequirements, asOf);

    expect(result.verdict).toBe("ELIGIBLE");
    expect(result.failedRequirements).toEqual([]);
  });

  it("returns NOT_ELIGIBLE with a structured GPA blocker", () => {
    const result = evaluateEligibility(
      { ...eligibleProfile, gpa: 2.9 },
      explicitRequirements,
      asOf
    );

    expect(result.verdict).toBe("NOT_ELIGIBLE");
    expect(result.failedRequirements).toContainEqual(
      expect.objectContaining({
        requirement: "gpa",
        required: ">=3.2",
        actual: 2.9,
        messageData: expect.objectContaining({ type: "gpa_below_minimum" })
      })
    );
  });

  it("returns NOT_ELIGIBLE when the application deadline has passed", () => {
    const result = evaluateEligibility(
      eligibleProfile,
      { ...explicitRequirements, deadline: { sourceStatus: "EXPLICIT", value: "2026-09-05" } },
      asOf
    );

    expect(result.verdict).toBe("NOT_ELIGIBLE");
    expect(result.failedRequirements[0]?.messageData.type).toBe("deadline_passed");
  });

  it("returns LIKELY_ELIGIBLE when known requirements pass but nationality wording is ambiguous", () => {
    const result = evaluateEligibility(
      eligibleProfile,
      { ...explicitRequirements, nationality: { sourceStatus: "AMBIGUOUS", note: "International applicants welcome" } },
      asOf
    );

    expect(result.verdict).toBe("LIKELY_ELIGIBLE");
    expect(result.checks.find((check) => check.requirement === "nationality")?.status).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when no official hard requirements are stated", () => {
    const unstated = { sourceStatus: "NOT_STATED" } as const;
    const result = evaluateEligibility(
      eligibleProfile,
      {
        nationality: unstated,
        age: unstated,
        educationLevel: unstated,
        academicYear: unstated,
        minimumGpa: unstated,
        residency: unstated,
        requiresLegalAuthorization: unstated,
        deadline: unstated
      },
      asOf
    );

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.checks.every((check) => check.status === "UNKNOWN")).toBe(true);
  });
});
// End of section: these tests cover confirmed success, a GPA failure, deadline failure, ambiguity, and completely missing source data.

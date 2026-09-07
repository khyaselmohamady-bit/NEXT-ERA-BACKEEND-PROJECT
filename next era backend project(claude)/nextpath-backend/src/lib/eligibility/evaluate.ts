import type {
  AgeRange,
  EligibilityCheck,
  EligibilityProfile,
  EligibilityResult,
  EligibilityVerdict,
  HardRequirementName,
  OpportunityHardRequirements,
  Requirement
} from "./types";

// End of section: imports bring in types only, so this engine has no dependency on Next.js, Supabase, or an AI provider.

// SECTION: Date and display helpers
function parseIsoDate(value: string): Date | undefined {
  const parts = value.split("-").map(Number);
  const [year, month, day] = parts;

  if (parts.length !== 3 || !year || !month || !day) {
    return undefined;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function ageOn(birthDate: string, asOf: Date): number | undefined {
  const birth = parseIsoDate(birthDate);
  if (!birth) {
    return undefined;
  }

  let age = asOf.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayThisYear = new Date(
    Date.UTC(asOf.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate())
  );

  if (asOf < birthdayThisYear) {
    age -= 1;
  }

  return age;
}

function displayList(values: Array<string | number>): string {
  return values.join(", ");
}
// End of section: these helpers make date comparisons timezone-safe and turn requirement arrays into readable response data.

// SECTION: Structured check builders
function sourceUnknownCheck(
  requirement: HardRequirementName,
  source: Requirement<unknown>
): EligibilityCheck {
  const isAmbiguous = source.sourceStatus === "AMBIGUOUS";

  return {
    requirement,
    status: "UNKNOWN",
    required: null,
    actual: null,
    messageData: {
      type: isAmbiguous ? "source_requirement_ambiguous" : "source_requirement_not_stated"
    }
  };
}

function missingProfileCheck(
  requirement: HardRequirementName,
  required: string | number | boolean
): EligibilityCheck {
  return {
    requirement,
    status: "UNKNOWN",
    required,
    actual: null,
    messageData: { type: "profile_data_missing" }
  };
}

function passCheck(
  requirement: HardRequirementName,
  required: string | number | boolean,
  actual: string | number | boolean
): EligibilityCheck {
  return {
    requirement,
    status: "PASS",
    required,
    actual,
    messageData: { type: "requirement_met" }
  };
}

function failCheck(
  requirement: HardRequirementName,
  required: string | number | boolean,
  actual: string | number | boolean,
  failureType: string
): EligibilityCheck {
  return {
    requirement,
    status: "FAIL",
    required,
    actual,
    messageData: { type: failureType, required, actual }
  };
}
// End of section: every rule uses these helpers so pass, fail, and unknown results have one consistent API shape.

// SECTION: Individual hard-requirement evaluators
function evaluateNationality(
  profile: EligibilityProfile,
  requirement: Requirement<string[]>
): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck("nationality", requirement);
  }
  if (!profile.nationalityCode) {
    return missingProfileCheck("nationality", displayList(requirement.value));
  }

  return requirement.value.includes(profile.nationalityCode)
    ? passCheck("nationality", displayList(requirement.value), profile.nationalityCode)
    : failCheck("nationality", displayList(requirement.value), profile.nationalityCode, "nationality_not_accepted");
}

function evaluateAge(
  profile: EligibilityProfile,
  requirement: Requirement<AgeRange>,
  asOf: Date
): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck("age", requirement);
  }

  const actualAge = profile.birthDate ? ageOn(profile.birthDate, asOf) : undefined;
  const required = `${requirement.value.minimum ?? "any"}-${requirement.value.maximum ?? "any"}`;
  if (actualAge === undefined) {
    return missingProfileCheck("age", required);
  }

  const meetsMinimum = requirement.value.minimum === undefined || actualAge >= requirement.value.minimum;
  const meetsMaximum = requirement.value.maximum === undefined || actualAge <= requirement.value.maximum;
  return meetsMinimum && meetsMaximum
    ? passCheck("age", required, actualAge)
    : failCheck("age", required, actualAge, "age_outside_allowed_range");
}

function evaluateAllowedValue(
  name: "education_level" | "academic_year" | "residency",
  actual: string | number | undefined,
  requirement: Requirement<Array<string | number>>,
  failureType: string
): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck(name, requirement);
  }
  const required = displayList(requirement.value);
  if (actual === undefined) {
    return missingProfileCheck(name, required);
  }

  return requirement.value.includes(actual)
    ? passCheck(name, required, actual)
    : failCheck(name, required, actual, failureType);
}

function evaluateMinimumGpa(
  profile: EligibilityProfile,
  requirement: Requirement<number>
): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck("gpa", requirement);
  }
  if (profile.gpa === undefined) {
    return missingProfileCheck("gpa", `>=${requirement.value}`);
  }

  return profile.gpa >= requirement.value
    ? passCheck("gpa", `>=${requirement.value}`, profile.gpa)
    : failCheck("gpa", `>=${requirement.value}`, profile.gpa, "gpa_below_minimum");
}

function evaluateLegalAuthorization(
  profile: EligibilityProfile,
  requirement: Requirement<true>
): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck("legal_authorization", requirement);
  }
  if (profile.hasRequiredLegalAuthorization === undefined) {
    return missingProfileCheck("legal_authorization", true);
  }

  return profile.hasRequiredLegalAuthorization
    ? passCheck("legal_authorization", true, true)
    : failCheck("legal_authorization", true, false, "legal_authorization_missing");
}

function evaluateDeadline(requirement: Requirement<string>, asOf: Date): EligibilityCheck {
  if (requirement.sourceStatus !== "EXPLICIT") {
    return sourceUnknownCheck("deadline", requirement);
  }

  const deadline = parseIsoDate(requirement.value);
  if (!deadline) {
    return {
      requirement: "deadline",
      status: "UNKNOWN",
      required: requirement.value,
      actual: null,
      messageData: { type: "invalid_source_deadline" }
    };
  }

  const today = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()));
  return deadline >= today
    ? passCheck("deadline", requirement.value, today.toISOString().slice(0, 10))
    : failCheck("deadline", requirement.value, today.toISOString().slice(0, 10), "deadline_passed");
}
// End of section: each evaluator handles one hard rule and returns facts rather than human-written prose.

// SECTION: Verdict calculation
function verdictFromChecks(checks: EligibilityCheck[]): EligibilityVerdict {
  if (checks.some((check) => check.status === "FAIL")) {
    return "NOT_ELIGIBLE";
  }

  const passedCount = checks.filter((check) => check.status === "PASS").length;
  const hasUnknown = checks.some((check) => check.status === "UNKNOWN");

  if (!hasUnknown) {
    return "ELIGIBLE";
  }

  return passedCount > 0 ? "LIKELY_ELIGIBLE" : "UNKNOWN";
}
// End of section: a confirmed failed hard requirement always wins; otherwise missing or ambiguous facts reduce certainty without inventing a rejection.

// SECTION: Public eligibility engine
export function evaluateEligibility(
  profile: EligibilityProfile,
  requirements: OpportunityHardRequirements,
  asOf: Date = new Date()
): EligibilityResult {
  const checks = [
    evaluateNationality(profile, requirements.nationality),
    evaluateAge(profile, requirements.age, asOf),
    evaluateAllowedValue("education_level", profile.educationLevel, requirements.educationLevel, "education_level_not_accepted"),
    evaluateAllowedValue("academic_year", profile.academicYear, requirements.academicYear, "academic_year_not_accepted"),
    evaluateMinimumGpa(profile, requirements.minimumGpa),
    evaluateAllowedValue("residency", profile.residencyCountryCode, requirements.residency, "residency_not_accepted"),
    evaluateLegalAuthorization(profile, requirements.requiresLegalAuthorization),
    evaluateDeadline(requirements.deadline, asOf)
  ];

  return {
    verdict: verdictFromChecks(checks),
    checks,
    failedRequirements: checks.filter((check) => check.status === "FAIL")
  };
}
// End of section: this is the only function callers need; it combines individual checks into the four-state verdict and structured blockers.

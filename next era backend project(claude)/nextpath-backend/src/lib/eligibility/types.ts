// SECTION: Shared eligibility vocabulary
export type EligibilityVerdict =
  | "ELIGIBLE"
  | "LIKELY_ELIGIBLE"
  | "UNKNOWN"
  | "NOT_ELIGIBLE";

export type CheckStatus = "PASS" | "FAIL" | "UNKNOWN";

export type HardRequirementName =
  | "nationality"
  | "age"
  | "education_level"
  | "academic_year"
  | "gpa"
  | "residency"
  | "legal_authorization"
  | "deadline";
// End of section: these unions make invalid verdicts, check states, and requirement names impossible to use accidentally.

// SECTION: Student data used by hard eligibility rules
export type EducationLevel = "SECONDARY" | "DIPLOMA" | "BACHELOR" | "MASTER" | "PHD";

export interface EligibilityProfile {
  nationalityCode?: string;
  birthDate?: string;
  educationLevel?: EducationLevel;
  academicYear?: number;
  gpa?: number;
  residencyCountryCode?: string;
  hasRequiredLegalAuthorization?: boolean;
}
// End of section: this deliberately contains only hard-eligibility facts; interests and skills belong to the later match engine.

// SECTION: Source-aware requirement definitions
export type Requirement<T> =
  | { sourceStatus: "EXPLICIT"; value: T }
  | { sourceStatus: "AMBIGUOUS"; note?: string }
  | { sourceStatus: "NOT_STATED" };

export interface AgeRange {
  minimum?: number;
  maximum?: number;
}

export interface OpportunityHardRequirements {
  nationality: Requirement<string[]>;
  age: Requirement<AgeRange>;
  educationLevel: Requirement<EducationLevel[]>;
  academicYear: Requirement<number[]>;
  minimumGpa: Requirement<number>;
  residency: Requirement<string[]>;
  requiresLegalAuthorization: Requirement<true>;
  deadline: Requirement<string>;
}
// End of section: sourceStatus preserves the difference between an official rule, unclear wording, and missing source data.

// SECTION: Explainable engine output
export interface EligibilityCheck {
  requirement: HardRequirementName;
  status: CheckStatus;
  required: string | number | boolean | null;
  actual: string | number | boolean | null;
  messageData: Record<string, string | number | boolean | null>;
}

export interface EligibilityResult {
  verdict: EligibilityVerdict;
  checks: EligibilityCheck[];
  failedRequirements: EligibilityCheck[];
}
// End of section: the output remains structured so the frontend can render it and the AI layer can explain it without altering the decision.

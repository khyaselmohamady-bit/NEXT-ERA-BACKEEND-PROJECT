import {
  MATCH_WEIGHTS,
  type MatchCheck,
  type MatchOpportunity,
  type MatchProfile,
  type MatchResult,
  type MatchVerdict
} from "./types";

// SECTION: Overlap helpers
// Token-based overlap on free-text fields. We lowercase + trim to make matches
// case-insensitive and robust to surrounding whitespace. The scoring uses
// "share of opportunity-preferred tokens that the student covers" so a
// student with 0 of the preferred tokens scores 0 — not the inverse (which
// would unfairly reward sparse profiles).

function normalizeTokens(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of values) {
    const token = raw.trim().toLowerCase();
    if (token.length === 0) {
      continue;
    }
    if (seen.has(token)) {
      continue;
    }
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function overlapRatio(studentTokens: string[], preferredTokens: string[]): number {
  if (preferredTokens.length === 0) {
    return 0;
  }
  const studentSet = new Set(studentTokens);
  let hits = 0;
  for (const token of preferredTokens) {
    if (studentSet.has(token)) {
      hits += 1;
    }
  }
  return hits / preferredTokens.length;
}

function award(
  dimension: keyof typeof MATCH_WEIGHTS,
  preferredCount: number,
  ratio: number
): MatchCheck {
  if (preferredCount === 0) {
    return {
      dimension,
      max: MATCH_WEIGHTS[dimension],
      awarded: null,
      messageData: { type: "no_preferred_tokens" }
    };
  }
  if (ratio <= 0) {
    return {
      dimension,
      max: MATCH_WEIGHTS[dimension],
      awarded: 0,
      messageData: { type: "no_overlap" }
    };
  }
  // Round to one decimal to keep the breakdown stable for tests and UI.
  const awarded = Math.round(MATCH_WEIGHTS[dimension] * ratio * 10) / 10;
  return {
    dimension,
    max: MATCH_WEIGHTS[dimension],
    awarded,
    messageData: {
      type: "partial_overlap",
      ratio: Math.round(ratio * 100) / 100
    }
  };
}
// End of section: each sub-score is a `MatchCheck` with the same shape so the
// frontend can render the whole breakdown with a single decoder.

// SECTION: Language scoring
// Languages need a richer comparison than plain string overlap because the
// opportunity may require "B2" English while the student claims "B1". The MVP
// score is binary (covers = full marks, doesn't cover = 0) because the
// CEFR ordering is not currently represented in the data model.
function languageMatch(
  studentLanguages: MatchProfile["languages"],
  preferredLanguages: MatchOpportunity["preferredLanguages"]
): { preferredCount: number; ratio: number } {
  if (!preferredLanguages || preferredLanguages.length === 0) {
    return { preferredCount: 0, ratio: 0 };
  }
  const studentTuples = (studentLanguages ?? []).map((entry) => ({
    language: entry.language.trim().toLowerCase(),
    level: entry.level.trim().toLowerCase()
  }));
  let hits = 0;
  for (const preferred of preferredLanguages) {
    const wanted = {
      language: preferred.language.trim().toLowerCase(),
      level: preferred.level.trim().toLowerCase()
    };
    if (
      studentTuples.some(
        (s) => s.language === wanted.language && s.level === wanted.level
      )
    ) {
      hits += 1;
    }
  }
  return {
    preferredCount: preferredLanguages.length,
    ratio: hits / preferredLanguages.length
  };
}

function languageCheck(
  studentLanguages: MatchProfile["languages"],
  preferredLanguages: MatchOpportunity["preferredLanguages"]
): MatchCheck {
  const { preferredCount, ratio } = languageMatch(studentLanguages, preferredLanguages);
  if (preferredCount === 0) {
    return {
      dimension: "language",
      max: MATCH_WEIGHTS.language,
      awarded: null,
      messageData: { type: "no_preferred_tokens" }
    };
  }
  if (ratio <= 0) {
    return {
      dimension: "language",
      max: MATCH_WEIGHTS.language,
      awarded: 0,
      messageData: { type: "no_overlap" }
    };
  }
  const awarded = Math.round(MATCH_WEIGHTS.language * ratio * 10) / 10;
  return {
    dimension: "language",
    max: MATCH_WEIGHTS.language,
    awarded,
    messageData: {
      type: "partial_overlap",
      ratio: Math.round(ratio * 100) / 100
    }
  };
}
// End of section: a separate helper keeps the tuple-matching logic isolated
// from the token-overlap helpers above.

// SECTION: Verdict band
function verdictFromScore(score: number | null): MatchVerdict {
  if (score === null) {
    return "UNKNOWN";
  }
  if (score >= 80) {
    return "STRONG";
  }
  if (score >= 60) {
    return "GOOD";
  }
  if (score >= 40) {
    return "FAIR";
  }
  return "POOR";
}
// End of section: band boundaries are codified here so a test can pin them
// without restating the numbers in two places.

// SECTION: Pure engine entry point
export function evaluateMatch(
  profile: MatchProfile,
  opportunity: MatchOpportunity
): MatchResult {
  const studentMajors = normalizeTokens(profile.major);
  const studentSkills = normalizeTokens(profile.skills);
  const studentInterests = normalizeTokens(profile.interests);
  const studentGoals = normalizeTokens(profile.goals);
  const studentExperience = normalizeTokens(profile.experience);
  const studentAcademic = normalizeTokens(profile.academicFit);

  const preferredMajors = normalizeTokens(opportunity.preferredMajors);
  const preferredSkills = normalizeTokens(opportunity.preferredSkills);
  const preferredInterests = normalizeTokens(opportunity.preferredInterests);
  const preferredGoals = normalizeTokens(opportunity.preferredGoals);
  const preferredExperience = normalizeTokens(opportunity.preferredExperience);
  const preferredAcademic = normalizeTokens(opportunity.preferredAcademicFit);

  const checks: MatchCheck[] = [
    award("major", preferredMajors.length, overlapRatio(studentMajors, preferredMajors)),
    award("skills", preferredSkills.length, overlapRatio(studentSkills, preferredSkills)),
    award("interests", preferredInterests.length, overlapRatio(studentInterests, preferredInterests)),
    award("goals", preferredGoals.length, overlapRatio(studentGoals, preferredGoals)),
    award("experience", preferredExperience.length, overlapRatio(studentExperience, preferredExperience)),
    languageCheck(profile.languages, opportunity.preferredLanguages),
    award("academic", preferredAcademic.length, overlapRatio(studentAcademic, preferredAcademic))
  ];

  // UNKNOWN if every dimension had no preferred tokens — there's nothing
  // to score against, so claiming any total would be a lie.
  const scorable = checks.filter((check) => check.awarded !== null);
  if (scorable.length === 0) {
    return { score: null, verdict: "UNKNOWN", checks };
  }

  const total = scorable.reduce((sum, check) => sum + (check.awarded ?? 0), 0);
  const score = Math.round(total * 10) / 10;
  return { score, verdict: verdictFromScore(score), checks };
}
// End of section: this is the only function a route or test needs to call.
// It has no Supabase, no Next.js, no AI — pure data in, structured data out.
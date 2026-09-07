// SECTION: Match engine vocabulary
// The match engine is the second of the project's two deterministic engines.
// It runs *after* the eligibility engine has decided the student may apply —
// a fail in the eligibility verdict short-circuits here (handled at the route
// layer), so the match engine only ever sees opportunities the student is
// allowed to consider.

export type MatchVerdict = "UNKNOWN" | "POOR" | "FAIR" | "GOOD" | "STRONG";
// End of section: four ordinal bands (POOR <40, FAIR 40–59, GOOD 60–79,
// STRONG ≥80) plus UNKNOWN for "we have nothing to score with". A binary
// pass/fail is exactly what the blueprint warns against in §17.

// SECTION: Student-side soft facts
// Mirrors the `soft_facts` JSONB column added in
// supabase/migrations/20260907090000_soft_facts.sql.
export interface MatchProfile {
  /** Student's declared major(s), free text — e.g. ["Computer Engineering"]. */
  major?: string[];
  /** Skills the student claims, free text — e.g. ["Python", "PyTorch"]. */
  skills?: string[];
  /** Areas of interest — e.g. ["AI", "robotics"]. */
  interests?: string[];
  /** Goals — e.g. ["scholarship", "research"]. */
  goals?: string[];
  /** Past experience descriptors — e.g. ["internship at X"]. */
  experience?: string[];
  /** Languages and self-rated strength — e.g. [{ language: "English", level: "B2" }]. */
  languages?: Array<{ language: string; level: string }>;
  /** Academic standing descriptors — e.g. ["honors list", "GPA 3.6"]. */
  academicFit?: string[];
}
// End of section: every field optional so the engine treats missing data as
// "we don't know", never as zero. This matches the eligibility engine's
// missingProfileCheck pattern.

// SECTION: Opportunity-side soft facts
// The opportunity model from §9 carries one universal shape; for the match
// engine we only need the soft side — the eligibility engine already handles
// the hard side.
export interface MatchOpportunity {
  /** Fields the opportunity explicitly prefers, free text. */
  preferredMajors?: string[];
  preferredSkills?: string[];
  preferredInterests?: string[];
  preferredGoals?: string[];
  /** Years/d of experience considered a plus. */
  preferredExperience?: string[];
  /** Required or preferred language+level tuples. */
  preferredLanguages?: Array<{ language: string; level: string }>;
  /** Free-form academic descriptors the opportunity mentions. */
  preferredAcademicFit?: string[];
}
// End of section: when every `preferred*` field is absent the engine returns
// UNKNOWN — it has nothing to score against. This is the same posture the
// eligibility engine takes for `NOT_STATED` requirements.

// SECTION: Sub-score weight constants
// Pinned in code so a future test can assert the breakdown exactly as printed
// in the blueprint's §18 example (Major 20 / Skills 20 / Interests 15 / Goals
// 15 / Experience 10 / Language 10 / Academic 10 → total 100).
export const MATCH_WEIGHTS = {
  major: 20,
  skills: 20,
  interests: 15,
  goals: 15,
  experience: 10,
  language: 10,
  academic: 10
} as const;
// End of section: a `const` object lets us sum and audit the weights in a
// single place — changing the breakdown requires editing one block.

// SECTION: Engine output
export interface MatchCheck {
  /** The sub-score this check describes. */
  dimension: keyof typeof MATCH_WEIGHTS;
  /** Maximum points this dimension can contribute. */
  max: number;
  /** Points actually awarded. `null` when nothing could be scored. */
  awarded: number | null;
  /** Stable machine-readable code for the AI explanation layer (§25). */
  messageData: Record<string, string | number | boolean | null>;
}

export interface MatchResult {
  /** Total score 0–100. `null` when nothing could be scored. */
  score: number | null;
  /** Ordinal band derived from `score`. */
  verdict: MatchVerdict;
  /** Per-dimension breakdown in the order they were summed. */
  checks: MatchCheck[];
}
// End of section: structured output, same pattern as `EligibilityResult`, so
// the AI explanation layer (§25, future) can render prose without deciding
// the score itself.
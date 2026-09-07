// SECTION: Verification vocabulary
// Exposed application-side enums for the verification columns added in
// supabase/migrations/20260907100000_verification.sql. Keeping them here
// (and in the CHECK constraint) gives the route handlers, repository, and
// future curator UI one canonical source to import from.

export type VerificationStatus = "VERIFIED" | "REVIEW_NEEDED";
export type Confidence = "HIGH" | "MEDIUM";
// End of section: any string union changes here MUST also update the CHECK
// constraint in the migration, otherwise a writer could smuggle in a new
// value that the database would reject.

export interface Verification {
  source: string | null;
  lastVerifiedAt: string | null;
  status: VerificationStatus | null;
  confidence: Confidence | null;
}
// End of section: `Verification` is the camelCase shape the application
// uses; the database stores the same four fields under snake_case names
// and the repository mapper does the translation.

// SECTION: Classification helpers
// Pure functions that answer narrow questions about a verification row.
// Kept pure (no Supabase, no I/O) so the demo scene that renders
// "Verified from official source" can call them with whatever data the
// frontend already has.

export function isVerified(verification: Verification): boolean {
  return verification.status === "VERIFIED";
}

export function isHighConfidence(verification: Verification): boolean {
  return verification.confidence === "HIGH";
}

export function needsReview(verification: Verification): boolean {
  // `REVIEW_NEEDED` is explicit, but a missing status is also a signal
  // that a curator hasn't yet looked at the row — treat it as needing
  // review so the demo's "verified" badge never appears on unverified data.
  return verification.status !== "VERIFIED";
}

export function describeVerification(verification: Verification): string {
  if (verification.status === "VERIFIED" && verification.lastVerifiedAt) {
    const source = verification.source ? ` from ${verification.source}` : "";
    return `Verified${source} on ${verification.lastVerifiedAt}.`;
  }
  if (verification.status === "REVIEW_NEEDED") {
    return "Verification needed — data may be incomplete or out of date.";
  }
  return "Not yet verified.";
}
// End of section: the descriptor matches the user-visible strings from the
// blueprint's §12 diagram ("Verified from official source — last verified
// [date]"). It is a stable, predictable format so the AI explanation layer
// (a future increment) can rely on the same wording.
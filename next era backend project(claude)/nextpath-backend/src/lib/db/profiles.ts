import type { SupabaseClient } from "@supabase/supabase-js";

import type { EligibilityProfile } from "@/lib/eligibility/types";
import type { MatchProfile } from "@/lib/match/types";
import { getSupabaseClient } from "@/lib/supabase/client";

// SECTION: Row shape
// Matches the profiles table after both init_schema.sql and the soft_facts
// migration. Adding `soft_facts` here is the only change the new column
// requires — callers that don't care about soft facts (e.g. the eligibility
// engine) keep their existing interface via `getProfileById`.
interface ProfileRow {
  id: string;
  nationality_code: string | null;
  birth_date: string | null;
  education_level: EligibilityProfile["educationLevel"] | null;
  academic_year: number | null;
  gpa: number | null;
  residency_country_code: string | null;
  has_required_legal_authorization: boolean | null;
  soft_facts: MatchProfile | Record<string, never>;
}

function rowToEligibilityProfile(row: ProfileRow): EligibilityProfile {
  return {
    nationalityCode: row.nationality_code ?? undefined,
    birthDate: row.birth_date ?? undefined,
    educationLevel: row.education_level ?? undefined,
    academicYear: row.academic_year ?? undefined,
    gpa: row.gpa ?? undefined,
    residencyCountryCode: row.residency_country_code ?? undefined,
    hasRequiredLegalAuthorization: row.has_required_legal_authorization ?? undefined
  };
}

function rowToMatchProfile(row: ProfileRow): MatchProfile {
  // `soft_facts` is `not null default '{}'::jsonb`, so it is always an object.
  // Returning the row's value as-is is safe; the engine treats empty objects
  // as "no soft facts" rather than zero.
  return row.soft_facts ?? {};
}

function rowToFullProfile(row: ProfileRow): {
  eligibility: EligibilityProfile;
  match: MatchProfile;
} {
  return {
    eligibility: rowToEligibilityProfile(row),
    match: rowToMatchProfile(row)
  };
}
// End of section: three mappers share one place to translate snake_case
// columns into camelCase application types. Adding a new column only
// requires changing the mapper, not every caller.

// SECTION: Reads
export async function getProfileById(
  userId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<EligibilityProfile | null> {
  const row = await loadProfileRow(userId, client);
  return row ? rowToEligibilityProfile(row) : null;
}

export async function getMatchProfileById(
  userId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<MatchProfile | null> {
  const row = await loadProfileRow(userId, client);
  return row ? rowToMatchProfile(row) : null;
}

export async function getFullProfileById(
  userId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<{ eligibility: EligibilityProfile; match: MatchProfile } | null> {
  const row = await loadProfileRow(userId, client);
  return row ? rowToFullProfile(row) : null;
}

async function loadProfileRow(
  userId: string,
  client: SupabaseClient
): Promise<ProfileRow | null> {
  const { data, error } = await client
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load profile ${userId}: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return data as ProfileRow;
}
// End of section: three read entry points share one helper. `maybeSingle`
// (not `single`) is deliberate — "profile doesn't exist yet" is a normal,
// expected case for a new user, not an error condition.

// SECTION: Writes
export async function upsertProfile(
  userId: string,
  profile: EligibilityProfile,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client.from("profiles").upsert({
    id: userId,
    nationality_code: profile.nationalityCode ?? null,
    birth_date: profile.birthDate ?? null,
    education_level: profile.educationLevel ?? null,
    academic_year: profile.academicYear ?? null,
    gpa: profile.gpa ?? null,
    residency_country_code: profile.residencyCountryCode ?? null,
    has_required_legal_authorization: profile.hasRequiredLegalAuthorization ?? null
  });

  if (error) {
    throw new Error(`Failed to save profile ${userId}: ${error.message}`);
  }
}

export async function upsertSoftFacts(
  userId: string,
  match: MatchProfile,
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  const { error } = await client
    .from("profiles")
    .upsert({ id: userId, soft_facts: match });

  if (error) {
    throw new Error(`Failed to save soft facts ${userId}: ${error.message}`);
  }
}

export async function upsertFullProfile(
  userId: string,
  profile: { eligibility: EligibilityProfile; match: MatchProfile },
  client: SupabaseClient = getSupabaseClient()
): Promise<void> {
  // Two upserts — we don't depend on a transaction here because (a) both
  // operate on the same row, so a partial failure leaves the row in a
  // still-consistent shape, and (b) the profile PUT route already does the
  // "read existing, merge, write" pattern, so a second call here would be
  // redundant. If a future increment needs atomicity, this is the place.
  await upsertProfile(userId, profile.eligibility, client);
  await upsertSoftFacts(userId, profile.match, client);
}
// End of section: `upsertProfile` keeps its pre-existing contract so the
// eligibility engine's tests continue to pass unchanged. `upsertSoftFacts` is
// the new entry point for match-engine data. `upsertFullProfile` is a
// convenience used by the profile route to write both halves in one call.
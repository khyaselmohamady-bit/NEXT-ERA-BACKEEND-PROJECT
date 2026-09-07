import type { SupabaseClient } from "@supabase/supabase-js";

import type { OpportunityHardRequirements } from "@/lib/eligibility/types";
import type { Verification } from "@/lib/opportunities/verification";
import type { SearchFilters } from "@/lib/search/aiAdapter";
import { getSupabaseClient } from "@/lib/supabase/client";

// SECTION: Row shape and public type
// Matches the opportunities table after both init_schema.sql and the
// verification migration. Adding `source`, `last_verified_at`,
// `verification_status`, and `confidence` is the only change the §12
// columns require — callers automatically see the new fields through
// `Opportunity` and `Opportunity.verification`.
interface OpportunityRow {
  id: string;
  title: string;
  organization: string | null;
  source_url: string | null;
  hard_requirements: OpportunityHardRequirements;
  source: string | null;
  last_verified_at: string | null;
  verification_status: Verification["status"];
  confidence: Verification["confidence"];
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string | null;
  sourceUrl: string | null;
  hardRequirements: OpportunityHardRequirements;
  verification: Verification;
}

function rowToOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    title: row.title,
    organization: row.organization,
    sourceUrl: row.source_url,
    hardRequirements: row.hard_requirements,
    verification: {
      source: row.source,
      lastVerifiedAt: row.last_verified_at,
      status: row.verification_status,
      confidence: row.confidence
    }
  };
}
// End of section: `hardRequirements` passes straight through since it's stored as JSONB
// matching `OpportunityHardRequirements` exactly — no per-field mapping needed.
// The verification fields are grouped under `verification` so the response
// shape has one obvious place to look for §12 metadata.

// SECTION: Reads
export async function getOpportunityById(
  id: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<Opportunity | null> {
  const { data, error } = await client
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load opportunity ${id}: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  return rowToOpportunity(data as OpportunityRow);
}

export async function listOpportunities(
  client: SupabaseClient = getSupabaseClient()
): Promise<Opportunity[]> {
  const { data, error } = await client
    .from("opportunities")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list opportunities: ${error.message}`);
  }

  return (data as OpportunityRow[] | null ?? []).map(rowToOpportunity);
}
// End of section: listOpportunities is what a future "bulk evaluate" route will page through.

// SECTION: Search
export async function searchOpportunities(
  filters: SearchFilters,
  client: SupabaseClient = getSupabaseClient()
): Promise<Opportunity[]> {
  // PostgREST's query builder lets us chain `.ilike`, `.contains`, etc. on
  // the JSONB column. We translate the §65 filter shape into one
  // query; if every filter is absent, the call degrades to "list
  // everything ordered newest-first" so the route doesn't have to
  // branch on filter presence.
  let query = client.from("opportunities").select("*").order("created_at", { ascending: false });

  if (filters.nationality) {
    // Nationality lives inside `hard_requirements.nationality.value` (a
    // JSONB array). PostgREST's `cs` (contains) operator checks that
    // the array contains the supplied element.
    query = query.contains("hard_requirements", {
      nationality: { sourceStatus: "EXPLICIT", value: [filters.nationality] }
    });
  }

  if (filters.educationLevel) {
    query = query.contains("hard_requirements", {
      educationLevel: { sourceStatus: "EXPLICIT", value: [filters.educationLevel] }
    });
  }

  if (filters.deadlineBefore) {
    // Deadline is a single string in `hard_requirements.deadline.value`.
    // `.lte` compares JSONB scalars when both sides are simple scalars.
    query = query.lte(
      "hard_requirements->deadline->>value" as never,
      filters.deadlineBefore
    );
  }

  if (filters.query) {
    // Free-text hint from the AI: match it against title or organization
    // case-insensitively. The adapter is responsible for keeping the
    // hint short so the `ilike` pattern doesn't blow up.
    const pattern = `%${filters.query}%`;
    query = query.or(`title.ilike.${pattern},organization.ilike.${pattern}`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to search opportunities: ${error.message}`);
  }

  return (data as OpportunityRow[] | null ?? []).map(rowToOpportunity);
}
// End of section: filter chain stays linear (one `if` per dimension) so
// adding a new filter is a single branch plus a single PostgREST call.
// §23 is enforced at the route layer — the adapter never returns
// opportunity rows, only filters, so the database is always the
// source of truth for what matches.

// SECTION: Writes
export interface CreateOpportunityInput {
  title: string;
  organization?: string;
  sourceUrl?: string;
  hardRequirements: OpportunityHardRequirements;
}

export async function createOpportunity(
  input: CreateOpportunityInput,
  client: SupabaseClient = getSupabaseClient()
): Promise<Opportunity> {
  const { data, error } = await client
    .from("opportunities")
    .insert({
      title: input.title,
      organization: input.organization ?? null,
      source_url: input.sourceUrl ?? null,
      hard_requirements: input.hardRequirements
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create opportunity: ${error.message}`);
  }

  return rowToOpportunity(data as OpportunityRow);
}
// End of section: opportunities RLS only allows public reads (see the migration), so writing
// through this function requires a service-role client until an admin auth role exists.

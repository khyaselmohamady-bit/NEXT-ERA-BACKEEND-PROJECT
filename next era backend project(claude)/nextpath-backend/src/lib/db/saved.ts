import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getOpportunityById,
  type Opportunity
} from "@/lib/db/opportunities";
import { getSupabaseClient } from "@/lib/supabase/client";

// SECTION: Row shape and public type
// Matches the saved_opportunities table in
// supabase/migrations/20260907110000_saved_opportunities.sql.
interface SavedRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  saved_at: string;
}

export interface SavedOpportunity {
  /** The saved_opportunities row id (used by some clients for keying). */
  savedId: string;
  /** When the student saved this opportunity. */
  savedAt: string;
  /** The full Opportunity payload, joined from the opportunities table. */
  opportunity: Opportunity;
}
// End of section: the joined shape lets the demo render a saved-opportunities
// list without a second round-trip per card. The `savedId` is exposed in case
// a future increment needs to address a saved row by its own primary key.

// SECTION: Reads
export async function listSavedByUser(
  userId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<SavedOpportunity[]> {
  const { data, error } = await client
    .from("saved_opportunities")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list saved opportunities ${userId}: ${error.message}`);
  }

  const rows = (data as SavedRow[] | null) ?? [];
  const results: SavedOpportunity[] = [];
  for (const row of rows) {
    // `getOpportunityById` returns `null` when the underlying opportunity has
    // been deleted (which cascades and removes the saved row too, but we still
    // defensively skip orphans so a stale row never appears in the response).
    const opportunity = await getOpportunityById(row.opportunity_id, client);
    if (!opportunity) {
      continue;
    }
    results.push({
      savedId: row.id,
      savedAt: row.saved_at,
      opportunity
    });
  }
  return results;
}
// End of section: a per-row getOpportunityById is `O(n)` queries, which is
// fine for MVP-sized lists (the demo seeds three opportunities, a typical
// student is in the tens). A future increment can swap this for a single
// PostgREST resource-embedding query without changing the public type.

// SECTION: Writes
export interface SavedRowOnly {
  savedId: string;
  savedAt: string;
  opportunityId: string;
}
// End of section: the write paths return the minimal saved-row shape so the
// route can hand back a payload without a second database round-trip in the
// test environment. The list path returns a richer shape (with the full
// Opportunity joined) because the demo renders a saved-opportunities page.

export async function saveOpportunity(
  userId: string,
  opportunityId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<SavedRowOnly> {
  const { data, error } = await client
    .from("saved_opportunities")
    .insert({ user_id: userId, opportunity_id: opportunityId })
    .select()
    .single();

  if (error) {
    // The unique constraint on (user_id, opportunity_id) raises a PostgREST
    // error with a `code` of `23505`. Callers can detect this to return a
    // 409 instead of a generic 500.
    throw new Error(`Failed to save opportunity ${opportunityId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Failed to save opportunity ${opportunityId}: no row returned.`);
  }

  const row = data as SavedRow;
  return {
    savedId: row.id,
    savedAt: row.saved_at,
    opportunityId: row.opportunity_id
  };
}

export async function unsaveOpportunity(
  userId: string,
  opportunityId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { error } = await client
    .from("saved_opportunities")
    .delete()
    .eq("user_id", userId)
    .eq("opportunity_id", opportunityId);

  if (error) {
    throw new Error(`Failed to unsave opportunity ${opportunityId}: ${error.message}`);
  }
  // PostgREST's `delete` doesn't return a row count from the mock; we
  // signal "did anything happen" via the call recording in tests rather
  // than a count. Returning `true` means the call succeeded; whether a row
  // actually existed is not exposed through the public API.
  return true;
}
// End of section: writes go through the same dependency-injection pattern
// as the opportunities repository. The mock client used in tests records
// every `insert` / `delete` call so the route tests can assert the
// expected query shape.
import type { SupabaseClient } from "@supabase/supabase-js";

import { getOpportunityById, type Opportunity } from "@/lib/db/opportunities";
import type { ApplicationState } from "@/lib/applications/stateMachine";
import { getSupabaseClient } from "@/lib/supabase/client";

// SECTION: Row shape and public type
// Matches the applications table in
// supabase/migrations/20260907120000_applications.sql.
interface ApplicationRow {
  id: string;
  user_id: string;
  opportunity_id: string;
  state: ApplicationState;
  created_at: string;
  updated_at: string;
}

export interface Application {
  id: string;
  state: ApplicationState;
  createdAt: string;
  updatedAt: string;
  opportunityId: string;
}

export interface ApplicationWithOpportunity {
  application: Application;
  opportunity: Opportunity;
}
// End of section: the bare `Application` shape is what the PUT and
// POST routes return. The joined shape is what the GET list endpoint
// returns so the demo can render a tracker page without a second
// round-trip per row.

// SECTION: Mappers
function rowToApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    opportunityId: row.opportunity_id
  };
}
// End of section: single source of truth for snake_case → camelCase,
// matching the conventions established by the other repositories.

// SECTION: Reads
export async function listApplicationsByUser(
  userId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<ApplicationWithOpportunity[]> {
  const { data, error } = await client
    .from("applications")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list applications ${userId}: ${error.message}`);
  }

  const rows = (data as ApplicationRow[] | null) ?? [];
  const results: ApplicationWithOpportunity[] = [];
  for (const row of rows) {
    const opportunity = await getOpportunityById(row.opportunity_id, client);
    if (!opportunity) {
      continue;
    }
    results.push({
      application: rowToApplication(row),
      opportunity
    });
  }
  return results;
}

export async function getApplicationById(
  applicationId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<Application | null> {
  const { data, error } = await client
    .from("applications")
    .select("*")
    .eq("id", applicationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load application ${applicationId}: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return rowToApplication(data as ApplicationRow);
}
// End of section: `listApplicationsByUser` performs a per-row
// opportunity lookup so the demo can render a tracker page directly
// from the response. `getApplicationById` returns the bare Application
// (no joined opportunity) because the route will fetch the
// opportunity only if it needs it.

// SECTION: Writes
export async function createApplication(
  userId: string,
  opportunityId: string,
  initialState: ApplicationState,
  client: SupabaseClient = getSupabaseClient()
): Promise<Application> {
  const { data, error } = await client
    .from("applications")
    .insert({
      user_id: userId,
      opportunity_id: opportunityId,
      state: initialState
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create application ${opportunityId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Failed to create application ${opportunityId}: no row returned.`);
  }
  return rowToApplication(data as ApplicationRow);
}

export async function updateApplicationState(
  applicationId: string,
  newState: ApplicationState,
  client: SupabaseClient = getSupabaseClient()
): Promise<Application> {
  const { data, error } = await client
    .from("applications")
    .update({ state: newState })
    .eq("id", applicationId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update application ${applicationId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Failed to update application ${applicationId}: no row returned.`);
  }
  return rowToApplication(data as ApplicationRow);
}

export async function deleteApplication(
  applicationId: string,
  client: SupabaseClient = getSupabaseClient()
): Promise<boolean> {
  const { error } = await client
    .from("applications")
    .delete()
    .eq("id", applicationId);

  if (error) {
    throw new Error(`Failed to delete application ${applicationId}: ${error.message}`);
  }
  return true;
}
// End of section: write paths accept an optional Supabase client and
// throw a descriptive error on Supabase failure. The unique constraint
// on (user_id, opportunity_id) makes a second createApplication for the
// same (user, opportunity) pair surface as a Postgres error the route
// turns into a 409.
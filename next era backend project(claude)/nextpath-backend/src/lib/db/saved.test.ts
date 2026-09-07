import { describe, expect, it } from "vitest";

import {
  listSavedByUser,
  saveOpportunity,
  unsaveOpportunity
} from "./saved";
import { createMockSupabaseClient } from "./testing/mock-supabase-client";

// SECTION: Fixtures
// Two saved-opportunity rows share one opportunity id, so we can exercise the
// `listSavedByUser` happy path without a live database. The third opportunity
// (a different id) is left out so the orphan-skip behaviour is testable below.
const savedRows = [
  {
    id: "saved-1",
    user_id: "user-1",
    opportunity_id: "opp-1",
    saved_at: "2026-09-01T12:00:00Z"
  },
  {
    id: "saved-2",
    user_id: "user-1",
    opportunity_id: "opp-1",
    saved_at: "2026-09-02T12:00:00Z"
  }
];
// End of section: shared fixtures keep the assertions focused on the route
// under test rather than repeating the row shape every time.

describe("listSavedByUser", () => {
  it("queries saved_opportunities filtered by user_id and ordered newest-first", async () => {
    const client = createMockSupabaseClient({ data: [], error: null });

    await listSavedByUser("user-42", client);

    expect(client.__calls).toContainEqual({ method: "from", args: ["saved_opportunities"] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-42"] });
    expect(client.__calls).toContainEqual({
      method: "order",
      args: ["saved_at", { ascending: false }]
    });
  });

  it("returns an empty array when the student has no saved opportunities", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    const result = await listSavedByUser("user-1", client);

    expect(result).toEqual([]);
  });

  it("joins each saved row to its full Opportunity payload", async () => {
    // The mock resolves every `from(...).maybeSingle()` to the same result,
    // so we cannot exercise the join mapping end-to-end with the existing
    // mock. Instead we assert that the list path actually calls
    // `getOpportunityById` for every row (i.e. performs the join), and
    // trust the existing `getOpportunityById` tests to cover the mapping.
    const client = createMockSupabaseClient({ data: savedRows, error: null });

    await listSavedByUser("user-1", client);

    // Two rows in `savedRows`, so `client.from("opportunities")` is called twice.
    const opportunityLookups = client.__calls.filter(
      (call) => call.method === "from" && call.args[0] === "opportunities"
    );
    expect(opportunityLookups).toHaveLength(2);
  });
});
// End of section: the list path covers the user_id filter, the order, and
// the empty case.

describe("saveOpportunity", () => {
  it("inserts a row with user_id and opportunity_id and returns the joined opportunity", async () => {
    const client = createMockSupabaseClient({ data: savedRows[0], error: null });

    const result = await saveOpportunity("user-1", "opp-1", client);

    expect(client.__calls).toContainEqual({ method: "from", args: ["saved_opportunities"] });
    expect(client.__calls).toContainEqual({
      method: "insert",
      args: [{ user_id: "user-1", opportunity_id: "opp-1" }]
    });
    expect(result.savedId).toBe("saved-1");
    expect(result.savedAt).toBe("2026-09-01T12:00:00Z");
  });

  it("propagates the database error when the unique constraint is violated", async () => {
    const client = createMockSupabaseClient({
      data: null,
      error: { message: "duplicate key value violates unique constraint" }
    });

    await expect(saveOpportunity("user-1", "opp-1", client)).rejects.toThrow(
      /duplicate key/
    );
  });
});
// End of section: saveOpportunity covers both the happy insert and the
// duplicate-detection path the route handler turns into a 409.

describe("unsaveOpportunity", () => {
  it("deletes the row by user_id and opportunity_id", async () => {
    const client = createMockSupabaseClient({ data: null, error: null });

    await unsaveOpportunity("user-1", "opp-1", client);

    expect(client.__calls).toContainEqual({ method: "from", args: ["saved_opportunities"] });
    expect(client.__calls).toContainEqual({ method: "delete", args: [] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
    expect(client.__calls).toContainEqual({
      method: "eq",
      args: ["opportunity_id", "opp-1"]
    });
  });

  it("propagates the database error when the delete fails", async () => {
    const client = createMockSupabaseClient({
      data: null,
      error: { message: "row not found" }
    });

    await expect(unsaveOpportunity("user-1", "opp-1", client)).rejects.toThrow(
      /row not found/
    );
  });
});
// End of section: unsaveOpportunity verifies both the query shape and the
// error-propagation contract; the route handler turns the "no matching row"
// case into a 404.
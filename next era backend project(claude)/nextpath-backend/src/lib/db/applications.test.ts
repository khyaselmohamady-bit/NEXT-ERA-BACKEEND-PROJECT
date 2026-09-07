import { describe, expect, it } from "vitest";

import {
  createApplication,
  deleteApplication,
  getApplicationById,
  listApplicationsByUser,
  updateApplicationState
} from "./applications";
import { createMockSupabaseClient } from "./testing/mock-supabase-client";

const applicationFixture = {
  id: "app-1",
  user_id: "user-1",
  opportunity_id: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e",
  state: "SAVED" as const,
  created_at: "2026-09-07T10:00:00Z",
  updated_at: "2026-09-07T10:00:00Z"
};

describe("listApplicationsByUser", () => {
  it("queries applications filtered by user_id and ordered newest-first by updated_at", async () => {
    const client = createMockSupabaseClient({ result: { data: [], error: null } });

    await listApplicationsByUser("user-42", client);

    expect(client.__calls).toContainEqual({ method: "from", args: ["applications"] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-42"] });
    expect(client.__calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }]
    });
  });

  it("returns an empty array when the student has no applications", async () => {
    const client = createMockSupabaseClient({ result: { data: null, error: null } });

    const result = await listApplicationsByUser("user-1", client);

    expect(result).toEqual([]);
  });

  it("joins each application to its full Opportunity payload", async () => {
    const client = createMockSupabaseClient({ data: [applicationFixture], error: null });

    await listApplicationsByUser("user-1", client);

    // The mock resolves every `from(...)` to the same builder, so we
    // assert that `getOpportunityById` was invoked for every row by
    // counting `from("opportunities")` calls.
    const opportunityLookups = client.__calls.filter(
      (call) => call.method === "from" && call.args[0] === "opportunities"
    );
    expect(opportunityLookups.length).toBe(1);
  });
});

describe("getApplicationById", () => {
  it("returns null when no application matches the id", async () => {
    const client = createMockSupabaseClient({ result: { data: null, error: null } });

    const result = await getApplicationById("missing-id", client);

    expect(result).toBeNull();
  });

  it("maps a row to an Application", async () => {
    const client = createMockSupabaseClient({ data: applicationFixture, error: null });

    const result = await getApplicationById("app-1", client);

    expect(result).toEqual({
      id: "app-1",
      state: "SAVED",
      createdAt: "2026-09-07T10:00:00Z",
      updatedAt: "2026-09-07T10:00:00Z",
      opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e"
    });
  });
});

describe("createApplication", () => {
  it("inserts a row with user_id, opportunity_id, and the requested initial state", async () => {
    const client = createMockSupabaseClient({ data: applicationFixture, error: null });

    await createApplication(
      "user-1",
      "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e",
      "SAVED",
      client
    );

    expect(client.__calls).toContainEqual({
      method: "insert",
      args: [
        {
          user_id: "user-1",
          opportunity_id: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e",
          state: "SAVED"
        }
      ]
    });
  });

  it("propagates unique-constraint violations as thrown errors", async () => {
    const client = createMockSupabaseClient({
      data: null,
      error: { message: "duplicate key value violates unique constraint" }
    });

    await expect(
      createApplication("user-1", "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e", "SAVED", client)
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("updateApplicationState", () => {
  it("updates the state column for the supplied application id", async () => {
    const client = createMockSupabaseClient({
      data: { ...applicationFixture, state: "PREPARING" },
      error: null
    });

    await updateApplicationState("app-1", "PREPARING", client);

    expect(client.__calls).toContainEqual({ method: "update", args: [{ state: "PREPARING" }] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["id", "app-1"] });
  });
});

describe("deleteApplication", () => {
  it("deletes the row by id", async () => {
    const client = createMockSupabaseClient({ result: { data: null, error: null } });

    await deleteApplication("app-1", client);

    expect(client.__calls).toContainEqual({ method: "delete", args: [] });
    expect(client.__calls).toContainEqual({ method: "eq", args: ["id", "app-1"] });
  });

  it("propagates database errors", async () => {
    const client = createMockSupabaseClient({
      data: null,
      error: { message: "row not found" }
    });

    await expect(deleteApplication("app-1", client)).rejects.toThrow(/row not found/);
  });
});
// End of section: every repository entry point is exercised with at
// least one test, and the unique-constraint error path the route turns
// into 409 is pinned here.
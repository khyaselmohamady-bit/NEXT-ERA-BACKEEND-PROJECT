import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { createMockSupabaseClient } from "@/lib/db/testing/mock-supabase-client";

// SECTION: Mock injection
// The route calls `listOpportunities()` which calls `getSupabaseClient()` by
// default. To exercise the catch branch we mock `getSupabaseClient` to return
// a client whose `.from(...).order(...)` resolves with `{ data: null, error }`,
// causing `listOpportunities` to throw.
const mockedGetSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => mockedGetSupabaseClient(),
  getSupabaseConfig: () => ({
    url: "https://example.supabase.co",
    publishableKey: "anon-test-key"
  })
}));

afterEach(() => {
  mockedGetSupabaseClient.mockReset();
});
// End of section: the module-level mock replaces the real client factory for
// every test in this file. `afterEach` prevents a failing test from leaking
// mock state into the next one.

// SECTION: GET /api/opportunities (list)
describe("GET /api/opportunities", () => {
  it("returns 200 with an empty list when the database has no rows", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({ result: { data: null, error: null } })
    );
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", items: [], count: 0 });
  });

  it("returns 500 with an error envelope when the database query fails", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({
        result: { data: null, error: { message: "permission denied" } }
      })
    );
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("permission denied");
  });
});
// End of section: the list route's contract is (200, envelope) on success and
// (500, error envelope) when the underlying repository throws.
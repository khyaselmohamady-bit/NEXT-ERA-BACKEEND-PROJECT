import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";
import { createMockSupabaseClient } from "@/lib/db/testing/mock-supabase-client";

// SECTION: Mock injection
// Mirrors the list-route test: replace `getSupabaseClient` so the underlying
// repository's behaviour is under our control without spinning up a live
// Supabase project.
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
// End of section: same pattern as the list-route tests.

function contextWithId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// SECTION: GET /api/opportunities/:id
describe("GET /api/opportunities/:id", () => {
  it("returns 200 with the opportunity when the id matches a row", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({
        result: {
          data: {
            id: "opp-1",
            title: "AI Research Fellowship",
            organization: "Acme Foundation",
            source_url: "https://example.org/ai-fellowship",
            hard_requirements: {
              nationality: { sourceStatus: "NOT_STATED" },
              age: { sourceStatus: "NOT_STATED" },
              educationLevel: { sourceStatus: "NOT_STATED" },
              academicYear: { sourceStatus: "NOT_STATED" },
              minimumGpa: { sourceStatus: "NOT_STATED" },
              residency: { sourceStatus: "NOT_STATED" },
              requiresLegalAuthorization: { sourceStatus: "NOT_STATED" },
              deadline: { sourceStatus: "NOT_STATED" }
            },
            source: "Official website",
            last_verified_at: "2026-09-01T12:00:00Z",
            verification_status: "VERIFIED",
            confidence: "HIGH"
          },
          error: null
        }
      })
    );
    const response = await GET(new Request("http://localhost/api/opportunities/opp-1"), contextWithId("opp-1"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      status: "ok",
      opportunity: {
        id: "opp-1",
        title: "AI Research Fellowship",
        verification: {
          status: "VERIFIED",
          confidence: "HIGH"
        }
      }
    });
  });

  it("returns 404 with a clear message when no row matches the id", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({ result: { data: null, error: null } })
    );
    const response = await GET(
      new Request("http://localhost/api/opportunities/missing-id"),
      contextWithId("missing-id")
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      status: "not_found",
      message: expect.stringContaining("missing-id")
    });
  });

  it("returns 500 when the underlying query errors", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({
        result: { data: null, error: { message: "network down" } }
      })
    );
    const response = await GET(
      new Request("http://localhost/api/opportunities/anything"),
      contextWithId("anything")
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
    expect(body.message).toContain("network down");
  });
});
// End of section: three branches — found, missing, errored. The `missing` branch
// is the blueprint-mandated 404 path; the `errored` branch guards against
// Supabase outages turning into opaque 500s.
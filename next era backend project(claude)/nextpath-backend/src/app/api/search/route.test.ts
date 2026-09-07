import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";
import { createMockSupabaseClient } from "@/lib/db/testing/mock-supabase-client";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// SECTION: Supabase client injection
// The route calls `searchOpportunities` → `getSupabaseClient` by default.
// We mock the module to inject our test client without spinning up a
// live Supabase project.
const mockedGetSupabaseClient = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => mockedGetSupabaseClient(),
  getSupabaseConfig: () => ({
    url: "https://example.com.example.com",
    publishableKey: "anon-test-key"
  })
}));

afterEach(() => {
  mockedGetSupabaseClient.mockReset();
});
// End of section: same pattern as the opportunities route tests.

// SECTION: Structured body — happy path
describe("POST /api/search — structured filters", () => {
  it("returns 400 when the body is not valid JSON", async () => {
    const request = new Request("http://localhost/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_request");
  });

  it("returns 400 when neither filters nor query is supplied", async () => {
    const response = await POST(jsonRequest({}));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_request");
  });

  it("returns 400 when filters is an empty object", async () => {
    const response = await POST(jsonRequest({ filters: {} }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_request");
  });

  it("returns 400 when both filters and query are supplied", async () => {
    const response = await POST(
      jsonRequest({ filters: { nationality: "EG" }, query: "anything" })
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when educationLevel is not one of the allowed values", async () => {
    const response = await POST(jsonRequest({ filters: { educationLevel: "POTATO" } }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when deadlineBefore is not a YYYY-MM-DD date", async () => {
    const response = await POST(jsonRequest({ filters: { deadlineBefore: "soon" } }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when an unknown field appears in the filters object", async () => {
    const response = await POST(jsonRequest({ filters: { evilField: true } }));
    expect(response.status).toBe(400);
  });

  it("returns 200 with results when at least one filter matches", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({
        result: {
          data: [
            {
              id: "opp-1",
              title: "STEM Excellence Scholarship",
              organization: "NextPath Foundation",
              source_url: "https://example.org/stem-excellence",
              hard_requirements: {},
              source: null,
              last_verified_at: null,
              verification_status: null,
              confidence: null
            }
          ],
          error: null
        }
      })
    );

    const response = await POST(jsonRequest({ filters: { nationality: "EG" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.source).toBe("structured");
    expect(body.count).toBe(1);
    expect(body.items).toHaveLength(1);
  });

  it("returns 200 with an empty array when nothing matches", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({ result: { data: [], error: null } })
    );

    const response = await POST(jsonRequest({ filters: { nationality: "ZZ" } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.count).toBe(0);
    expect(body.items).toEqual([]);
  });

  it("returns 500 when the database query errors", async () => {
    mockedGetSupabaseClient.mockReturnValue(
      createMockSupabaseClient({
        result: { data: null, error: { message: "permission denied" } }
      })
    );

    const response = await POST(jsonRequest({ filters: { nationality: "EG" } }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe("error");
  });
});
// End of section: covers every documented status — 400 (×6), 200
// happy, 200 empty, 500.

// SECTION: Natural-language body — adapter path
describe("POST /api/search — natural-language query (no-op adapter)", () => {
  it("returns 400 with ai_disabled when the AI provider is not configured", async () => {
    // We don't inject a mock supabase client here because the adapter
    // short-circuits before the search runs.
    const response = await POST(jsonRequest({ query: "AI scholarships in Egypt" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("ai_disabled");
    expect(body.message).toContain("filters:");
  });

  it("returns 400 when the query is empty", async () => {
    const response = await POST(jsonRequest({ query: "" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when the query is longer than 500 characters", async () => {
    const longQuery = "x".repeat(501);
    const response = await POST(jsonRequest({ query: longQuery }));
    expect(response.status).toBe(400);
  });
});
// End of section: the AI path is gated by the no-op adapter; once a
// real adapter is wired (future increment), this describe block can
// add tests that inject a fake adapter to exercise the parsed-filters
// branch.
import { afterEach, describe, expect, it } from "vitest";

import { __setTestAuthenticate, GET, POST } from "./route";
import {
  createMockSupabaseClient,
  type MockSupabaseClient
} from "@/lib/db/testing/mock-supabase-client";
import type { GetCurrentUserResult } from "@/lib/auth/getCurrentUser";

// SECTION: Helpers
function jsonRequest(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost/api/saved", {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

let activeMock: MockSupabaseClient | null = null;

function authenticatedAuthenticate(): Promise<GetCurrentUserResult> {
  if (!activeMock) {
    throw new Error("test must set activeMock before calling authenticatedAuthenticate");
  }
  return Promise.resolve({
    status: "authenticated" as const,
    userId: "user-abc",
    user: { id: "user-abc", email: "student@example.org" },
    client: activeMock
  });
}

function unauthenticatedAuthenticate(): Promise<GetCurrentUserResult> {
  return Promise.resolve({
    status: "unauthenticated" as const,
    reason: "missing_credentials",
    message: "Request is missing a Bearer access token."
  });
}

afterEach(() => {
  __setTestAuthenticate(null);
  activeMock = null;
});
// End of section: `afterEach` clears the test hook so a failing test
// cannot leak state into the next one. Mirrors the profile-route pattern.

// SECTION: GET /api/saved
describe("GET /api/saved", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate());
    const response = await GET(jsonRequest("GET"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ status: "unauthenticated" });
  });

  it("returns 200 with an empty list when the student has no saves", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await GET(jsonRequest("GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", items: [], count: 0 });
  });

  it("queries saved_opportunities filtered by user_id", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    await GET(jsonRequest("GET"));

    expect(activeMock.__calls).toContainEqual({
      method: "from",
      args: ["saved_opportunities"]
    });
    expect(activeMock.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-abc"] });
  });
});
// End of section: GET covers 401, empty list, and the user_id filter.

// SECTION: POST /api/saved
describe("POST /api/saved", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate());
    const response = await POST(
      jsonRequest("POST", { opportunityId: "00000000-0000-0000-0000-000000000000" })
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const request = new Request("http://localhost/api/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_opportunity");
  });

  it("returns 400 when the body is empty", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(jsonRequest("POST", {}));
    expect(response.status).toBe(400);
  });

  it("returns 400 when the opportunityId is not a UUID", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(jsonRequest("POST", { opportunityId: "not-a-uuid" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when the opportunity does not exist", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "violates foreign key constraint" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "00000000-0000-0000-0000-000000000000" })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_opportunity");
  });

  it("returns 201 with the saved row on success", async () => {
    activeMock = createMockSupabaseClient({
      result: {
        data: {
          id: "saved-new",
          user_id: "user-abc",
          opportunity_id: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e",
          saved_at: "2026-09-07T10:00:00Z"
        },
        error: null
      }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e" })
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.saved).toEqual({
      savedId: "saved-new",
      savedAt: "2026-09-07T10:00:00Z",
      opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e"
    });
    // The repository inserts with the user_id and opportunity_id we passed.
    const insertCall = activeMock.__calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toEqual({
      user_id: "user-abc",
      opportunity_id: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e"
    });
  });

  it("returns 409 when the same opportunity is saved twice", async () => {
    // The mock resolves every call to `{ data: null, error: <msg> }` so we
    // construct one that simulates the unique-constraint violation.
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "duplicate key value violates unique constraint" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "b5f4c7d3-ae80-4b2c-9d3f-604b7c8d0e1f" })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.status).toBe("already_saved");
  });

  it("returns 500 when the database insert fails for any other reason", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "connection reset" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "c6e5d8e4-bf91-4c3d-ae40-715c8d9e1f2a" })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe("error");
  });
});
// End of section: POST covers every documented status — 401, 400 (3 paths),
// 201 (the happy insert), 409 (duplicate), 500 (other failures).
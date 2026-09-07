import { afterEach, describe, expect, it } from "vitest";

import { __setTestAuthenticate, GET, POST } from "./route";
import {
  createMockSupabaseClient,
  type MockSupabaseClient
} from "@/lib/db/testing/mock-supabase-client";
import type { GetCurrentUserResult } from "@/lib/auth/getCurrentUser";

function jsonRequest(method: "GET" | "POST", body?: unknown): Request {
  return new Request("http://localhost/api/applications", {
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

// SECTION: GET /api/applications
describe("GET /api/applications", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate());
    const response = await GET(jsonRequest("GET"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ status: "unauthenticated" });
  });

  it("returns 200 with an empty list when the student has no applications", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await GET(jsonRequest("GET"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", items: [], count: 0 });
  });

  it("queries applications filtered by user_id and ordered by updated_at desc", async () => {
    activeMock = createMockSupabaseClient({ result: { data: [], error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    await GET(jsonRequest("GET"));

    expect(activeMock.__calls).toContainEqual({ method: "from", args: ["applications"] });
    expect(activeMock.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-abc"] });
    expect(activeMock.__calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }]
    });
  });

  it("returns 500 when the database query errors", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "permission denied" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await GET(jsonRequest("GET"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({ status: "error" });
  });
});

// SECTION: POST /api/applications
describe("POST /api/applications", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate());
    const response = await POST(
      jsonRequest("POST", { opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e" })
    );
    expect(response.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const request = new Request("http://localhost/api/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json"
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_request");
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

  it("returns 201 with the application row on success", async () => {
    activeMock = createMockSupabaseClient({
      result: {
        data: {
          id: "app-new",
          user_id: "user-abc",
          opportunity_id: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e",
          state: "SAVED",
          created_at: "2026-09-07T10:00:00Z",
          updated_at: "2026-09-07T10:00:00Z"
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
    expect(body.application).toMatchObject({
      id: "app-new",
      state: "SAVED"
    });
    // Default initial state is SAVED — assert the insert carried it.
    const insertCall = activeMock.__calls.find((c) => c.method === "insert");
    expect(insertCall?.args[0]).toMatchObject({ state: "SAVED" });
  });

  it("returns 409 when the student is already tracking the opportunity", async () => {
    activeMock = createMockSupabaseClient({
      result: {
        data: null,
        error: { message: "duplicate key value violates unique constraint" }
      }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e" })
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.status).toBe("already_tracked");
  });

  it("returns 400 when the opportunity does not exist (FK violation)", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "violates foreign key constraint" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "00000000-0000-0000-0000-000000000000" })
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe("invalid_request");
  });

  it("returns 500 when the database insert fails for any other reason", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "connection reset" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await POST(
      jsonRequest("POST", { opportunityId: "a4e3b6c2-9d7f-4a1b-8c2e-5f3a6b7c9d0e" })
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.status).toBe("error");
  });
});
// End of section: covers every documented status — 401, 400 (3 paths),
// 201 (the happy insert), 409 (duplicate), 400 (FK), 500 (other).
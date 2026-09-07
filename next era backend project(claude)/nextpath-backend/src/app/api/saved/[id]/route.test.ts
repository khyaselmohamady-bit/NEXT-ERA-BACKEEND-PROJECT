import { afterEach, describe, expect, it } from "vitest";

import { __setTestAuthenticate, DELETE } from "./route";
import {
  createMockSupabaseClient,
  type MockSupabaseClient
} from "@/lib/db/testing/mock-supabase-client";
import type { GetCurrentUserResult } from "@/lib/auth/getCurrentUser";

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

function contextWithId(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/saved/:id", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate());
    const response = await DELETE(
      new Request("http://localhost/api/saved/00000000-0000-0000-0000-000000000000"),
      contextWithId("00000000-0000-0000-0000-000000000000")
    );
    expect(response.status).toBe(401);
  });

  it("returns 200 with a confirmation message on success", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await DELETE(
      new Request("http://localhost/api/saved/11111111-1111-1111-1111-111111111111"),
      contextWithId("11111111-1111-1111-1111-111111111111")
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ status: "ok" });
    expect(body.message).toContain("Removed");
  });

  it("queries saved_opportunities with delete + user_id + opportunity_id", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    await DELETE(
      new Request("http://localhost/api/saved/22222222-2222-2222-2222-222222222222"),
      contextWithId("22222222-2222-2222-2222-222222222222")
    );

    expect(activeMock.__calls).toContainEqual({ method: "delete", args: [] });
    expect(activeMock.__calls).toContainEqual({ method: "eq", args: ["user_id", "user-abc"] });
    expect(activeMock.__calls).toContainEqual({
      method: "eq",
      args: ["opportunity_id", "22222222-2222-2222-2222-222222222222"]
    });
  });

  it("returns 500 when the database delete fails", async () => {
    activeMock = createMockSupabaseClient({
      result: { data: null, error: { message: "permission denied" } }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await DELETE(
      new Request("http://localhost/api/saved/33333333-3333-3333-3333-333333333333"),
      contextWithId("33333333-3333-3333-3333-333333333333")
    );
    expect(response.status).toBe(500);
  });
});
// End of section: covers 401, 200 happy path, query-shape, and 500 — the
// four behaviours the route is responsible for.
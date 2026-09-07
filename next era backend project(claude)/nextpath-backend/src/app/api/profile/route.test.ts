import { afterEach, describe, expect, it } from "vitest";

import { __setTestAuthenticate, GET, PUT } from "./route";
import {
  createMockSupabaseClient,
  type MockSupabaseClient
} from "@/lib/db/testing/mock-supabase-client";
import type { GetCurrentUserResult } from "@/lib/auth/getCurrentUser";

// SECTION: Helpers
// `bearerRequest` and `plainRequest` mirror the auth-helper tests so the request
// shapes look familiar. `authenticatedAuthenticate` returns the discriminated
// union `getCurrentUser` would have returned if Supabase had validated a token.
function bearerRequest(token: string, body?: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method: body !== undefined ? "PUT" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

function plainRequest(method: "GET" | "PUT", body?: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method,
    ...(body !== undefined ? { "content-type": "application/json" } : {}),
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

function unauthenticatedAuthenticate(
  reason: "missing_credentials" | "invalid_token"
): Promise<GetCurrentUserResult> {
  return Promise.resolve({
    status: "unauthenticated" as const,
    reason,
    message:
      reason === "missing_credentials"
        ? "Request is missing a Bearer access token."
        : "Supabase could not verify the supplied access token."
  });
}

afterEach(() => {
  __setTestAuthenticate(null);
  activeMock = null;
});
// End of section: `afterEach` clears the test hook so a failing test cannot leak
// state into the next one. The suite also restores `activeMock` for symmetry.

// SECTION: GET tests
describe("GET /api/profile", () => {
  it("returns 401 with a clear message when the Authorization header is missing", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate("missing_credentials"));

    const response = await GET(plainRequest("GET"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({
      status: "unauthenticated",
      message: expect.stringContaining("Bearer")
    });
  });

  it("returns 401 when the token is rejected by Supabase", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate("invalid_token"));

    const response = await GET(bearerRequest("bogus-jwt"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toMatchObject({ status: "unauthenticated" });
  });

  it("returns the authenticated student's profile with status 200 when one exists", async () => {
    activeMock = createMockSupabaseClient({
      result: {
        data: {
          id: "user-abc",
          nationality_code: "EG",
          birth_date: "2002-04-15",
          education_level: "BACHELOR",
          academic_year: 2,
          gpa: 3.4,
          residency_country_code: "EG",
          has_required_legal_authorization: true,
          soft_facts: { skills: ["Python"] }
        },
        error: null
      }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await GET(bearerRequest("real-jwt"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.profile).toMatchObject({
      eligibility: {
        nationalityCode: "EG",
        educationLevel: "BACHELOR",
        academicYear: 2,
        gpa: 3.4
      },
      match: { skills: ["Python"] }
    });
    expect(activeMock.__calls).toContainEqual({ method: "from", args: ["profiles"] });
  });

  it("returns profile: null with status 200 when the student has not filled out a profile yet", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await GET(bearerRequest("real-jwt"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ status: "ok", profile: null });
  });
});
// End of section: every GET path is covered — 401 missing token, 401 invalid
// token, 200 with profile, 200 with null profile. The 200-null case matches
// `maybeSingle`'s contract documented in src/lib/db/profiles.ts.

// SECTION: PUT tests
describe("PUT /api/profile", () => {
  it("returns 401 when unauthenticated", async () => {
    __setTestAuthenticate(() => unauthenticatedAuthenticate("missing_credentials"));

    const response = await PUT(plainRequest("PUT", { gpa: 3.8 }));
    expect(response.status).toBe(401);
  });

  it("returns 400 when the body is not valid JSON", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const request = new Request("http://localhost/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not-json"
    });
    const response = await PUT(request);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_json");
  });

  it("returns 400 when the body is an empty object", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(plainRequest("PUT", {}));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("invalid_profile");
  });

  it("returns 400 when an unknown field is included", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(plainRequest("PUT", { gpa: 3.8, evilField: "x" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 when educationLevel is not one of the allowed values", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(plainRequest("PUT", { educationLevel: "POTATO" }));
    expect(response.status).toBe(400);
  });

  it("merges new fields with the existing profile and returns the refreshed row", async () => {
    // The mock returns the same `result.data` for every maybeSingle call,
    // so this test asserts that the new GPA replaces the old one and that
    // an upsert call was recorded. The deeper merge-with-existing-row logic
    // lives in the route; this test pins the externally-visible contract.
    activeMock = createMockSupabaseClient({
      result: {
        data: {
          id: "user-abc",
          nationality_code: "EG",
          birth_date: "2002-04-15",
          education_level: "BACHELOR",
          academic_year: 2,
          gpa: 3.4,
          residency_country_code: "EG",
          has_required_legal_authorization: true,
          soft_facts: {}
        },
        error: null
      }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(bearerRequest("real-jwt", { gpa: 3.8 }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    // `getProfileById` is called twice (existing, then refreshed) and
    // `upsertProfile` is called once. All three call `client.from("profiles")`,
    // and the upsert is the one carrying the merged payload.
    expect(
      activeMock.__calls.filter((c) => c.method === "from").map((c) => c.args[0])
    ).toEqual(["profiles", "profiles", "profiles"]);
    expect(activeMock.__calls.filter((c) => c.method === "upsert").length).toBe(1);
    const upsertCall = activeMock.__calls.find((c) => c.method === "upsert");
    expect(upsertCall?.args[0]).toMatchObject({ gpa: 3.8 });
  });

  it("writes soft facts to the same row when the PUT body includes them", async () => {
    activeMock = createMockSupabaseClient({
      result: {
        data: {
          id: "user-abc",
          nationality_code: null,
          birth_date: null,
          education_level: null,
          academic_year: null,
          gpa: null,
          residency_country_code: null,
          has_required_legal_authorization: null,
          soft_facts: {}
        },
        error: null
      }
    });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(
      bearerRequest("real-jwt", {
        softFacts: {
          major: ["Computer Engineering"],
          skills: ["Python", "PyTorch"],
          interests: ["AI"],
          languages: [{ language: "English", level: "C1" }]
        }
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    // Two upserts: one for the (empty) eligibility side, one for soft facts.
    const upserts = activeMock.__calls.filter((c) => c.method === "upsert");
    expect(upserts.length).toBe(2);
    const softFactsUpsert = upserts.find((c) =>
      (c.args[0] as Record<string, unknown>).soft_facts !== undefined
    );
    expect(softFactsUpsert?.args[0]).toMatchObject({
      soft_facts: {
        major: ["Computer Engineering"],
        skills: ["Python", "PyTorch"],
        interests: ["AI"],
        languages: [{ language: "English", level: "C1" }]
      }
    });
  });

  it("returns 400 when soft facts include an unknown field", async () => {
    activeMock = createMockSupabaseClient({ result: { data: null, error: null } });
    __setTestAuthenticate(authenticatedAuthenticate);

    const response = await PUT(
      bearerRequest("real-jwt", { softFacts: { evil: "x" } })
    );
    expect(response.status).toBe(400);
  });
});
// End of section: PUT covers all four failure modes (401, invalid JSON, empty
// body, unknown field, bad enum) and the happy merge path.
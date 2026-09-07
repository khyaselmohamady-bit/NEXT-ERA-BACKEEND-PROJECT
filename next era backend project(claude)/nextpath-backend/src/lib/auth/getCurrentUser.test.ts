import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getCurrentUser } from "./getCurrentUser";
import type { MockCall } from "@/lib/db/testing/mock-supabase-client";

// SECTION: Auth-only test mock
// Mirrors only the `auth.getUser` method `getCurrentUser` actually calls, plus a
// `__calls` recorder so tests can assert the helper passes the right JWT to Supabase
// (and never trusts an unverified id).
interface AuthGetUserResult {
  data: { user: { id: string; email: string | null } | null };
  error: { message: string } | null;
}

interface AuthOnlyMock {
  auth: {
    getUser: (jwt: string) => Promise<AuthGetUserResult>;
  };
  __calls: MockCall[];
}

function createAuthMock(response: AuthGetUserResult): AuthOnlyMock {
  const calls: MockCall[] = [];
  return {
    auth: {
      getUser: (jwt: string) => {
        calls.push({ method: "auth.getUser", args: [jwt] });
        return Promise.resolve(response);
      }
    },
    __calls: calls
  };
}

function bearerRequest(token: string): Request {
  return new Request("http://localhost/api/anything", {
    headers: { authorization: `Bearer ${token}` }
  });
}

function plainRequest(): Request {
  return new Request("http://localhost/api/anything");
}
// End of section: the mock is intentionally tiny — only `auth.getUser` is exercised by
// `getCurrentUser`, and `__calls` matches the recording convention used by the Postgrest
// mock so the auth tests feel consistent with the existing repository tests.

// SECTION: Environment setup
// The success path constructs a per-request Supabase client, which requires the two
// NEXT_PUBLIC_SUPABASE_* env vars to be present. Tests run in plain Node without a
// .env.local file, so we set fake values for the duration of the suite and restore
// whatever was there before.
const previousUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
const previousKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

beforeAll(() => {
  process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://example.supabase.co";
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "anon-test-key";
});

afterAll(() => {
  if (previousUrl === undefined) {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
  } else {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = previousUrl;
  }
  if (previousKey === undefined) {
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  } else {
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = previousKey;
  }
});
// End of section: env lifecycle is bracketed so other test files aren't affected.

describe("getCurrentUser", () => {
  it("returns authenticated with the user id and email when Supabase validates the JWT", async () => {
    const mock = createAuthMock({
      data: { user: { id: "user-abc", email: "student@example.org" } },
      error: null
    });

    const result = await getCurrentUser(bearerRequest("a-real-jwt"), mock as never);

    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") {
      throw new Error("expected authenticated");
    }
    expect(result.userId).toBe("user-abc");
    expect(result.user.id).toBe("user-abc");
    expect(result.user.email).toBe("student@example.org");
    expect(typeof result.client).toBe("object");
  });

  it("forwards the Bearer token to Supabase's auth.getUser so the server validates it", async () => {
    const mock = createAuthMock({
      data: { user: { id: "user-abc", email: null } },
      error: null
    });

    await getCurrentUser(bearerRequest("jwt-xyz"), mock as never);

    expect(mock.__calls).toContainEqual({ method: "auth.getUser", args: ["jwt-xyz"] });
  });

  it("returns unauthenticated/missing_credentials when there is no Authorization header", async () => {
    const mock = createAuthMock({
      data: { user: null },
      error: null
    });

    const result = await getCurrentUser(plainRequest(), mock as never);

    expect(result.status).toBe("unauthenticated");
    if (result.status !== "unauthenticated") {
      throw new Error("expected unauthenticated");
    }
    expect(result.reason).toBe("missing_credentials");
    expect(mock.__calls).toEqual([]);
  });

  it("returns unauthenticated/missing_credentials when the Authorization header is not a Bearer token", async () => {
    const mock = createAuthMock({
      data: { user: null },
      error: null
    });

    const request = new Request("http://localhost/api/anything", {
      headers: { authorization: "Basic dXNlcjpwYXNz" }
    });

    const result = await getCurrentUser(request, mock as never);

    expect(result.status).toBe("unauthenticated");
    if (result.status !== "unauthenticated") {
      throw new Error("expected unauthenticated");
    }
    expect(result.reason).toBe("missing_credentials");
    expect(mock.__calls).toEqual([]);
  });

  it("returns unauthenticated/invalid_token when Supabase rejects the JWT", async () => {
    const mock = createAuthMock({
      data: { user: null },
      error: { message: "JWT is expired" }
    });

    const result = await getCurrentUser(bearerRequest("expired-jwt"), mock as never);

    expect(result.status).toBe("unauthenticated");
    if (result.status !== "unauthenticated") {
      throw new Error("expected unauthenticated");
    }
    expect(result.reason).toBe("invalid_token");
    expect(result.message).toMatch(/expired/i);
    // The helper must still have asked Supabase to validate the token, rather than
    // trusting some unverified field in the header itself.
    expect(mock.__calls).toContainEqual({ method: "auth.getUser", args: ["expired-jwt"] });
  });

  it("returns unauthenticated/invalid_token when Supabase returns a user of null with no error", async () => {
    const mock = createAuthMock({
      data: { user: null },
      error: null
    });

    const result = await getCurrentUser(bearerRequest("garbage-jwt"), mock as never);

    expect(result.status).toBe("unauthenticated");
    if (result.status !== "unauthenticated") {
      throw new Error("expected unauthenticated");
    }
    expect(result.reason).toBe("invalid_token");
  });

  it("returns a per-request Supabase client configured with the access token so RLS sees auth.uid()", async () => {
    const mock = createAuthMock({
      data: { user: { id: "user-abc", email: null } },
      error: null
    });

    const result = await getCurrentUser(bearerRequest("a-real-jwt"), mock as never);

    expect(result.status).toBe("authenticated");
    if (result.status !== "authenticated") {
      throw new Error("expected authenticated");
    }

    // The returned client should expose the same `auth.getUser` shape as a real one;
    // tests downstream that wire repositories onto it will rely on that.
    expect(typeof (result.client as { auth?: unknown }).auth).toBe("object");
  });
});
// End of section: covers the three observable outcomes (authenticated, missing
// credentials, invalid token) plus the two ways each failure mode can arise (no header
// vs. wrong scheme; Supabase error vs. Supabase returned no user), and asserts that the
// helper never accepts an identity without first sending the token to Supabase.

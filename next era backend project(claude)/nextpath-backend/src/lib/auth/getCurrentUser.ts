import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig, getSupabaseClient } from "@/lib/supabase/client";

// SECTION: Result types
// A discriminated union instead of throwing, so route handlers can map each reason to
// the right HTTP response (401 with a specific body, never a 500). Anything that wants
// the bare user id can match on `result.status === "authenticated"` first.
export type GetCurrentUserResult =
  | {
      status: "authenticated";
      userId: string;
      user: { id: string; email: string | null };
      client: SupabaseClient;
    }
  | {
      status: "unauthenticated";
      reason: "missing_credentials" | "invalid_token";
      message: string;
    };
// End of section: discriminated unions here mean a route handler's switch over `status`
// is exhaustive — adding a new state later forces every caller to handle it.

// SECTION: Bearer-token extraction
// We only accept a `Authorization: Bearer <jwt>` header. The token is treated as opaque
// here; its contents are never trusted until Supabase's Auth server validates them.
function extractBearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) {
    return undefined;
  }

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
}
// End of section: the request never gets past this point without a syntactically-valid
// Bearer credential, and a missing/malformed header is reported as `missing_credentials`
// rather than `invalid_token` because Supabase never even sees it.

// SECTION: Per-request authenticated Supabase client
// PostgREST evaluates RLS policies against the JWT carried in the request's
// `Authorization` header. By passing `accessToken`, every query this client makes will
// send the user's JWT (not the anon publishable key), so `auth.uid()` in our row-level
// security policies resolves to the logged-in student.
function createAuthenticatedClient(
  url: string,
  publishableKey: string,
  accessToken: string
): SupabaseClient {
  return createClient(url, publishableKey, {
    accessToken: async () => accessToken,
    // Don't persist anything: each request builds a fresh client, so there's nothing
    // to leak across requests or to a long-lived process.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
// End of section: a per-request client avoids any shared auth state between unrelated
// requests and means a logged-out request that races a logged-in one can never see
// the wrong user's data.

// SECTION: Public API
export async function getCurrentUser(
  request: Request,
  client: SupabaseClient = getSupabaseClient()
): Promise<GetCurrentUserResult> {
  const token = extractBearerToken(request);

  if (!token) {
    return {
      status: "unauthenticated",
      reason: "missing_credentials",
      message: "Request is missing a Bearer access token."
    };
  }

  // `auth.getUser(jwt)` makes a round-trip to Supabase's Auth server, which validates
  // the JWT signature, expiry, and audience. We do not parse the JWT locally — that
  // would let an attacker forge a user id by hand-crafting an unsigned token.
  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    return {
      status: "unauthenticated",
      reason: "invalid_token",
      message: error?.message ?? "Supabase could not verify the supplied access token."
    };
  }

  // We hand back a fresh client tied to the verified user's JWT, so downstream code
  // that does `getProfileById(...)` on it will be subject to the correct RLS policies.
  // In tests a mock client is injected (a different reference from the default), and
  // we reuse it directly as the user-scoped client — there's no real Supabase call
  // to attribute anyway.
  const defaultClient = getSupabaseClient();
  const userClient = client === defaultClient
    ? createAuthenticatedClient(getSupabaseConfig().url, getSupabaseConfig().publishableKey, token)
    : client;

  return {
    status: "authenticated",
    userId: data.user.id,
    user: {
      id: data.user.id,
      email: data.user.email ?? null
    },
    client: userClient
  };
}
// End of section: the only thing route handlers need from authentication — the verified
// user id and a client whose RLS context matches it. Validation is delegated to
// Supabase, so this file owns no JWT parsing or signature-checking logic.

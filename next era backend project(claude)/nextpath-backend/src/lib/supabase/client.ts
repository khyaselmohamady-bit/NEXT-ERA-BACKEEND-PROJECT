import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// SECTION: Environment access
function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill in your team's Supabase project values.`
    );
  }
  return value;
}
// End of section: fails fast with an actionable message instead of a cryptic client-library error deep in a request handler.

// SECTION: Config helper
// Exposed so other modules (notably src/lib/auth/getCurrentUser.ts) can build
// per-request Supabase clients with their own auth context without re-parsing env
// vars themselves.
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    publishableKey: requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  };
}
// End of section: one place that reads the two env vars; the cached client below and
// any per-request auth client both call this rather than each touching process.env.

// SECTION: Client factory
let cachedClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    const { url, publishableKey } = getSupabaseConfig();
    cachedClient = createClient(url, publishableKey);
  }

  return cachedClient;
}
// End of section: one lazily-created client shared across route handlers, using the publishable key only (no service-role secret belongs here).

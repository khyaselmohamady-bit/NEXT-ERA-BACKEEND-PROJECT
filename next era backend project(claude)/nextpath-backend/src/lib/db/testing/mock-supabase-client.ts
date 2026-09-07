import type { SupabaseClient } from "@supabase/supabase-js";

// SECTION: Mock client
// A minimal stand-in for Supabase's chainable PostgrestQueryBuilder, covering only the
// methods the repository functions in src/lib/db actually call: from, select, eq, order,
// insert, upsert, single, maybeSingle. It resolves every terminal call (or being awaited
// directly, since real Postgrest builders are themselves thenable) to one fixed result,
// and records every call so a test can assert on how the query was built.
export interface MockQueryResult {
  data: unknown;
  error: { message: string } | null;
}

export interface MockCall {
  method: string;
  args: unknown[];
}

export interface MockSupabaseClient extends SupabaseClient {
  __calls: MockCall[];
}

// SECTION: Auth mock builder
// The repository tests never exercise `auth.getUser`, so the default mock has no
// `auth` shape. Route tests need a client that satisfies `client.auth.getUser`,
// so `createMockSupabaseClient` accepts an optional auth-getUser mock.
export interface MockAuthGetUserResult {
  data: { user: { id: string; email: string | null } | null };
  error: { message: string } | null;
}

export interface MockSupabaseClientOptions {
  authGetUser?: (jwt: string) => Promise<MockAuthGetUserResult>;
  result?: MockQueryResult;
}

export function createMockSupabaseClient(
  optionsOrResult: MockSupabaseClientOptions | MockQueryResult = {
    data: null,
    error: null
  }
): MockSupabaseClient {
  const options: MockSupabaseClientOptions =
    "data" in optionsOrResult && "error" in optionsOrResult && !("authGetUser" in optionsOrResult)
      ? { result: optionsOrResult }
      : (optionsOrResult as MockSupabaseClientOptions);
  const result: MockQueryResult = options.result ?? { data: null, error: null };

  const calls: MockCall[] = [];

  function record(method: string, args: unknown[]) {
    calls.push({ method, args });
  }

  const chainMethods = [
  "select",
  "eq",
  "order",
  "insert",
  "upsert",
  "update",
  "delete",
  "contains",
  "lte",
  "or"
] as const;

  const builder: Record<string, unknown> = {};
  for (const method of chainMethods) {
    builder[method] = (...args: unknown[]) => {
      record(method, args);
      return builder;
    };
  }
  builder.single = () => {
    record("single", []);
    return Promise.resolve(result);
  };
  builder.maybeSingle = () => {
    record("maybeSingle", []);
    return Promise.resolve(result);
  };
  // Supports `await client.from(...).select(...)` with no terminal call, matching how
  // real Postgrest query builders resolve when awaited directly.
  builder.then = (
    onFulfilled: (value: MockQueryResult) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);

  const client: Record<string, unknown> = {
    from: (table: string) => {
      record("from", [table]);
      return builder;
    },
    __calls: calls
  };

  if (options.authGetUser) {
    client.auth = {
      getUser: (jwt: string) => {
        record("auth.getUser", [jwt]);
        return options.authGetUser!(jwt);
      }
    };
  }

  return client as unknown as MockSupabaseClient;
}
// End of section: repository functions accept an optional SupabaseClient parameter specifically
// so tests can inject this mock instead of hitting a real project.

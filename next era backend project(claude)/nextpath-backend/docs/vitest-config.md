# `vitest.config.ts`

Configuration for the Vitest test runner.

- **`test.environment: "node"`** — tests run in a plain Node environment rather than a simulated browser (`jsdom`/`happy-dom`), since everything under test is backend logic — the eligibility engine and API route handlers — with no DOM involved.
- **`test.include: ["src/**/*.test.ts"]`** — picks up any `*.test.ts` file anywhere under `src/`, which is why `evaluate.test.ts` sits next to `evaluate.ts` and `route.test.ts` sits next to `route.ts` rather than in a separate top-level test folder.
- **`resolve.alias: { "@": ... }`** — maps the `@` import alias to the `src/` directory, so a test file can `import { getSupabaseClient } from "@/lib/supabase/client"` the same way application code does.

This alias entry is the one addition made to this file (see the changelog for why): `tsconfig.json`'s `paths` mapping only affects TypeScript's own type resolution and Next.js's bundler — it has no effect on how Vitest resolves imports at runtime. Without this `resolve.alias`, any test file that imports something via `@/...` fails with `Cannot find package '@/...'`, which is exactly what happened when the new route test was added.

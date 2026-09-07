# `package.json`

Project manifest for `nextpath-backend`, an API-only Next.js app (`"type": "module"` so `.ts` config files use ESM `import`/`export`).

## Scripts
- **`dev`** — `next dev`, local development server.
- **`build`** — `next build`, production build (this is what compiles both API routes and type-checks the whole project).
- **`start`** — `next start`, runs the production build.
- **`test`** — `vitest run`, runs the suite once (used in CI).
- **`test:watch`** — `vitest`, interactive watch mode for local development.
- **`typecheck`** — `tsc --noEmit`, type-checks without emitting files; catches type errors independently of building or testing.

## Dependencies (runtime)
- **`next`**, **`react`**, **`react-dom`** — the framework itself.
- **`@supabase/supabase-js`** — database/auth client (see `src/lib/supabase/client.ts`).
- **`zod`** — runtime schema validation, used by the new `/api/eligibility/evaluate` route to validate request bodies.

## devDependencies
- **`typescript`** — the compiler, used by `typecheck` and by `next build`'s internal type-checking pass.
- **`vitest`** — test runner.
- **`@types/node`**, **`@types/react`**, **`@types/react-dom`** — type declarations for the above.

## `packageManager` / `engines`
- **`"packageManager": "pnpm@12.3.4"`** — pins the exact package manager and version Corepack should use for this project, so every teammate and CI run installs with the same pnpm version rather than whatever they happen to have globally.
- **`"engines": { "node": ">=20" }`** — documents the minimum Node version the project expects (Next.js 16 requires a reasonably current Node).

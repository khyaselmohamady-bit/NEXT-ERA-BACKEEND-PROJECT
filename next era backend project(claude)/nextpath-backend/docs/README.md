# NEXTPATH Backend Docs — Start Here

These documents are for learning the backend, not just looking things up. Do **not** read them in file-name order. Follow the path below instead.

## The one-sentence idea

NEXTPATH receives facts about a student and facts about an opportunity, checks the hard rules in a predictable way, then returns an honest answer such as **eligible**, **likely eligible**, **unknown**, or **not eligible**.

Later, the backend will store those facts in Supabase and let a signed-in student see only their own information.

## First: understand the picture

Read [Beginner backend tour](./beginner-backend-tour.md) first. It explains every important folder, the request journey, and the words you will see in the code.

## Then follow this learning order

### Level 1 — What a backend is

1. [package.json](./package-json.md) — the command list and installed tools.
2. [health route](./health-route.md) — the smallest possible API endpoint.
3. [vitest config](./vitest-config.md) — how automated tests are found and run.

**Goal:** understand that an API route receives a request and returns JSON.

### Level 2 — The NEXTPATH decision vocabulary

1. [eligibility types](./eligibility-types.md)
2. [eligibility engine tests](./eligibility-evaluate-test.md)
3. [eligibility engine](./eligibility-evaluate.md)

**Goal:** understand the four verdicts and why the engine must not use AI to make the decision.

### Level 3 — Turn the engine into a real API

1. [eligibility API route](./eligibility-evaluate-route.md)
2. [eligibility API route tests](./eligibility-evaluate-route-test.md)

**Goal:** see how untrusted JSON is validated before it reaches the deterministic engine.

### Level 4 — Save and load information safely

1. [database schema](./db-schema.md)
2. [Supabase client](./supabase-client.md)
3. [profile repository](./db-profiles.md)
4. [opportunity repository](./db-opportunities.md)
5. [mock Supabase client](./mock-supabase-client.md)

**Goal:** understand how database rows become TypeScript objects, and why tests use a fake database client.

### Level 5 — Security and configuration

1. [environment example](./env-example.md)
2. [current-user authentication](./get-current-user.md)
3. [gitignore](./gitignore.md)

**Goal:** understand the difference between a public Supabase key, a secret, authentication, and Row-Level Security.

### Level 6 — Configuration reference

Read these only when you need them:

- [tsconfig.json](./tsconfig-json.md)
- [next.config.ts](./next-config.md)

## A simple way to read any code file

For each code file:

1. Read its matching document before opening the code.
2. Read one `SECTION` block in the code.
3. Stop at its `End of section` comment and explain that block aloud in your own words.
4. Open the matching test file, if there is one, and predict what should happen before reading the assertion.
5. Run the test after you understand the example.

You are not expected to memorise the code. The useful skill is being able to answer: **what information goes in, what result comes out, and why does this file exist?**

## Commands to use while learning

Run these from the project root:

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

- `pnpm test` checks that the rules behave as expected.
- `pnpm typecheck` checks that TypeScript types agree.
- `pnpm build` checks that Next.js can prepare the backend for production.
- `pnpm dev` starts the local server. Then visit `http://localhost:3000/api/health`.

## When a term feels confusing

Start in the [glossary](./beginner-backend-tour.md#small-glossary), then return to the file. Do not jump straight to advanced framework documentation unless you need more detail.

# Beginner Tour of the NEXTPATH Backend

This page explains the backend as a story. Read it before reading the detailed per-file documents.

## 1. What is this backend?

The backend is the part of NEXTPATH that runs away from the user's screen. A student might press a button in the frontend, but the backend does the careful work:

- checks whether the student is signed in;
- loads allowed data from the database;
- applies eligibility rules;
- returns a small JSON answer to the frontend.

The backend is not the website design. It is the trusted rules-and-data layer behind the design.

## 2. The most important promise

NEXTPATH must never let an AI model decide whether someone qualifies for an opportunity.

For example, suppose an opportunity requires GPA 3.2 and a student has GPA 2.9. The backend must return a factual result:

```json
{
  "verdict": "NOT_ELIGIBLE",
  "reason": "gpa_below_minimum"
}
```

An AI tool may later turn that fact into a friendly explanation, but it cannot change the fact. This is why the eligibility code is kept separate from API code and database code.

## 3. The project map

```text
nextpath-backend/
|
|-- src/
|   |-- app/api/                 API addresses the frontend can call
|   |-- lib/eligibility/         the pure rule engine
|   |-- lib/db/                  code that talks to database tables
|   |-- lib/auth/                code that verifies who is calling
|   `-- lib/supabase/            code that creates Supabase clients
|
|-- supabase/
|   |-- migrations/              instructions that create database tables/rules
|   `-- seed.sql                 safe demo data
|
|-- docs/                        beginner guides and per-file explanations
|
|-- package.json                 available commands and installed libraries
`-- CHANGES.md                   record of completed backend increments
```

You do not need to understand every folder at once. Start with `src/lib/eligibility/` because it contains the heart of the project.

## 4. Follow one request from start to finish

Imagine the frontend asks: “Is this student eligible for this scholarship?”

```text
Frontend sends JSON
        |
        v
API route receives the request
        |
        v
Zod checks that the JSON has the expected shape
        |
        v
Eligibility engine checks hard rules
        |
        v
API route returns structured JSON
        |
        v
Frontend displays it; AI may explain it in words
```

The current route for this learning example is:

```text
POST /api/eligibility/evaluate
```

The API route does not decide who is eligible. It only checks input and passes it to the engine. This separation makes the rules easy to test.

## 5. The three kinds of code you will see

### Types: “What shape should this information have?”

`src/lib/eligibility/types.ts` describes the expected pieces of information. For example, a profile may have a GPA, nationality, and birth date. A type is a plan or blueprint for data; it does not run by itself.

Think of this as a paper application form: it tells you what boxes exist, but it does not decide anything.

### Logic: “What should happen to this information?”

`src/lib/eligibility/evaluate.ts` contains functions that compare a student's facts with an opportunity's facts. It is deliberately a **pure function**:

- same input -> same result;
- no database request;
- no internet request;
- no AI call;
- no hidden information.

That makes it reliable and easy to test.

### Route: “How does information enter and leave the backend?”

`src/app/api/.../route.ts` files are API doors. A route receives an HTTP request and sends an HTTP response.

For this project, route files should stay small. They validate the request, call a function from `src/lib`, and return JSON. They should not contain complicated business rules.

## 6. The four eligibility answers

The backend never returns only yes or no.

| Result | Beginner meaning |
| --- | --- |
| `ELIGIBLE` | Every known, official hard rule was checked and passed. |
| `LIKELY_ELIGIBLE` | The known rules pass, but one or more facts are unclear or missing. |
| `UNKNOWN` | The official source does not give enough information to decide. |
| `NOT_ELIGIBLE` | At least one known hard rule fails. |

This avoids false confidence. Not seeing a requirement is not proof that a student passes it.

## 7. What is a hard requirement?

A hard requirement can prevent a student from applying. The current engine checks:

- nationality;
- age;
- education level;
- academic year;
- minimum GPA;
- residency;
- legal authorization;
- application deadline.

Skills, interests, experience, and career goals are **soft requirements**. They will later affect the match score, but they must never make someone ineligible by themselves.

## 8. Where does the database fit?

The engine can work with plain objects in a test. In the real product, those objects are stored in Supabase PostgreSQL tables.

```text
Supabase table row (snake_case)
        |
        v
Repository converts it to a TypeScript object (camelCase)
        |
        v
Eligibility engine uses the TypeScript object
```

For example, the database calls a column `nationality_code`, while TypeScript code calls it `nationalityCode`. The conversion happens in one repository function, so the rest of the project stays easy to read.

## 9. Why is authentication important?

Authentication answers: **“Who is making this request?”**

If a student is signed in, Supabase gives them a token. The auth helper verifies that token with Supabase. It must not simply trust a user ID written in a request.

After authentication, Row-Level Security (RLS) answers: **“May this signed-in person read or change this row?”**

Example: even if somebody edits a request manually, RLS should stop them from reading another student's profile.

## 10. Why do we write tests?

Tests are small automated examples that prove expected behaviour.

For example, a test can say:

```text
Given GPA = 2.9
and required GPA = 3.2
expect verdict = NOT_ELIGIBLE
and reason = gpa_below_minimum
```

When code changes later, the test catches an accidental change to that promise. Tests are especially important here because students need to trust the result.

## 11. Suggested first study session

Spend about one hour, in this order:

1. Read [eligibility types](./eligibility-types.md).
2. Read [eligibility engine tests](./eligibility-evaluate-test.md).
3. Read [eligibility engine](./eligibility-evaluate.md).
4. Run `pnpm test`.
5. Read [eligibility API route](./eligibility-evaluate-route.md).
6. Run `pnpm dev`, then open `http://localhost:3000/api/health`.

Do this with your teammate. After each file, each person should explain one sentence: **“This file exists because…”**

## Small glossary

| Word | Meaning |
| --- | --- |
| API | A way for the frontend to ask the backend for information or actions. |
| API route | One backend address, such as `/api/health`. |
| JSON | A text format for sending structured information between programs. |
| TypeScript type | A blueprint describing what data is allowed to look like. |
| Function | A named piece of code that takes input and returns an output. |
| Pure function | A function that gives the same output for the same input and does not use hidden outside information. |
| Database | Long-term storage for data such as profiles and opportunities. |
| Repository | A small layer that loads/saves database data for the rest of the app. |
| Supabase | The service providing this project’s PostgreSQL database, authentication, and storage. |
| Zod | A library that checks whether real input data has the expected shape. |
| JWT/token | A signed proof from Supabase that identifies a logged-in user. |
| RLS | Database rules that decide which rows a user may access. |
| Unit test | A small automatic check for one expected behaviour. |

# `src/lib/db/opportunities.ts` — new file

Repository functions for reading and writing rows in the `opportunities` table (schema in `docs/db-schema.md`).

## Beginner summary

This file is the backend’s **opportunity catalogue helper**. It knows how the `opportunities` database table is organised, while the rest of the app gets simpler TypeScript objects.

At the moment, normal users may read opportunities but may not create them. That is a security decision, not a missing feature: adding an opportunity will need an admin role later.

## `OpportunityRow` vs. `Opportunity`
`OpportunityRow` is the raw snake_case database shape; `Opportunity` (exported for use elsewhere, e.g. future API routes) is its camelCase equivalent. The one field that needs no transformation is `hardRequirements`/`hard_requirements` — since it's stored as JSONB matching `OpportunityHardRequirements` exactly, it passes straight through both directions with no per-field mapping.

## `getOpportunityById(id, client?)`
Same `.maybeSingle()` pattern as `getProfileById` — a missing opportunity id returns `null` rather than throwing, since "that opportunity doesn't exist (bad id, deleted, typo in a URL)" is a normal condition an API route needs to turn into a 404, not a 500.

## `listOpportunities(client?)`
Returns every opportunity, newest first (`order("created_at", { ascending: false })`). This is what a future "which of all opportunities am I eligible for" bulk-evaluation route will page through — evaluate each returned opportunity's `hardRequirements` against a student's profile using the existing `evaluateEligibility` engine. Defaults to an empty array rather than `null` when the table is empty, so callers never need a null check.

## `createOpportunity(input, client?)`
Inserts a new row and returns it via `.select().single()`, so the caller gets back the database-generated `id` and timestamps without a second round trip. Takes a `CreateOpportunityInput` (title required, `organization`/`sourceUrl` optional, `hardRequirements` required) rather than a full row, since the id and timestamps aren't the caller's to set.

Note from the schema doc: the `opportunities` table's RLS only allows public **reads**. Calling `createOpportunity` with the default (anon-key) client will be rejected by RLS — it's written to accept any `SupabaseClient` specifically so it can be called with a service-role client once that exists, without changing this file.

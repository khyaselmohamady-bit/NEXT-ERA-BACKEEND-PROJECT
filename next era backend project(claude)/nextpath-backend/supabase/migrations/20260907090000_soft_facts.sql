-- SECTION: Soft facts for the match engine
-- The deterministic match engine from §17/§18 needs facts that the
-- eligibility engine does not: major, skills, interests, goals, experience,
-- language strength, and academic fit. Per the §65 MVP definition, a single
-- JSONB column is sufficient — the schema-per-table layout from §44 is not a
-- §65 MUST and is intentionally deferred to keep MVP scope honest.
--
-- The shape mirrors `MatchProfile` in src/lib/match/types.ts exactly, so any
-- drift surfaces as a comment mismatch rather than as silent data loss.
alter table public.profiles
  add column if not exists soft_facts jsonb not null default '{}'::jsonb;

comment on column public.profiles.soft_facts is
  'Soft-eligibility facts for the match engine (major, skills, interests, goals, experience, language strength, academic fit). Maps to MatchProfile in src/lib/match/types.ts. Empty object means "no soft facts yet" — the match engine treats that as unknown, not zero.';
-- End of section: `not null default '{}'` means existing rows remain valid
-- without a backfill, and the engine can safely read `soft_facts` as an object
-- without null-checking every field.
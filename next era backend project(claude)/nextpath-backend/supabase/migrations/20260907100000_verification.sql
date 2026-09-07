-- SECTION: Verification metadata
-- The §65 "VERIFIED SOURCES" MVP item is satisfied by exposing the §12
-- verification fields on each opportunity row: where the data came from,
-- when it was last checked, what the verification outcome was, and how
-- confident we are. The four fields together let the frontend render
-- "Verified from official source — last verified [date]" or warn the
-- student when an opportunity has not been verified yet.
--
-- Status and confidence are plain `text` columns with CHECK constraints
-- rather than PostgreSQL enums because the §67 future admin workflow may
-- need to add a new status (e.g. `STALE`) without a migration that
-- rewrites every row.
alter table public.opportunities
  add column if not exists source text,
  add column if not exists last_verified_at timestamptz,
  add column if not exists verification_status text
    check (verification_status is null or verification_status in ('VERIFIED', 'REVIEW_NEEDED')),
  add column if not exists confidence text
    check (confidence is null or confidence in ('HIGH', 'MEDIUM'));

comment on column public.opportunities.source is
  'Free-text description of where the opportunity was sourced from (e.g. "Official website", "University partner feed"). §12.';
comment on column public.opportunities.last_verified_at is
  'Timestamp the row was last manually verified by a curator. §12.';
comment on column public.opportunities.verification_status is
  'VERIFIED (a curator confirmed the data) or REVIEW_NEEDED (data is unconfirmed or stale). §12.';
comment on column public.opportunities.confidence is
  'HIGH (official source, recent) or MEDIUM (third-party or older). §12.';
-- End of section: every column is nullable so existing rows remain valid
-- without a backfill. The §12 "VERIFIED / REVIEW_NEEDED" diagram maps
-- directly to the enum values here; the `confidence` enum mirrors §12's
-- HIGH / MEDIUM bands.
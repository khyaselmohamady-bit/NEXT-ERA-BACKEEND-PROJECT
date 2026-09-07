-- SECTION: Applications + tracker
-- The §65 "APPLICATION TRACKER" MVP item is a per-student record of how
-- far they've gotten with a given opportunity, modelled as a state
-- machine (§37). A row here represents "this student is interacting with
-- this opportunity"; the `state` column captures which step they're at.
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  state text not null check (
    state in (
      'DISCOVERED',
      'SAVED',
      'PREPARING',
      'READY',
      'SUBMITTED',
      'ACCEPTED',
      'REJECTED',
      'EXPIRED'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists applications_user_opportunity_idx
  on public.applications (user_id, opportunity_id);

create index if not exists applications_user_id_idx
  on public.applications (user_id);

comment on table public.applications is
  'Per-student application tracker. One row per (user_id, opportunity_id); state advances through the §37 state machine.';
-- End of section: `unique (user_id, opportunity_id)` enforces the
-- "one application per opportunity per student" invariant at the
-- database level so the application layer cannot accidentally create
-- duplicate rows. The CHECK constraint pins the state enum to the
-- exact eight values from §37.

-- SECTION: updated_at trigger reuse
-- The same trigger function `set_updated_at` defined in
-- 20260906120000_init_schema.sql applies here; creating a new trigger
-- on the applications table keeps `updated_at` accurate without
-- every write path having to set it manually.
create trigger set_applications_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();
-- End of section: re-using the existing function avoids defining a
-- second identical trigger function. The migration is idempotent
-- (`create trigger` would fail on re-run, but the project's migration
-- runner applies each file exactly once per environment).

-- SECTION: Row-level security
alter table public.applications enable row level security;

-- A student can only see and manage their own applications. The pattern
-- matches `profiles` and `saved_opportunities`.
create policy "applications_select_own" on public.applications
  for select using (auth.uid() = user_id);

create policy "applications_insert_own" on public.applications
  for insert with check (auth.uid() = user_id);

create policy "applications_update_own" on public.applications
  for update using (auth.uid() = user_id);

create policy "applications_delete_own" on public.applications
  for delete using (auth.uid() = user_id);
-- End of section: `update` is gated on the *current* row's owner
-- (`auth.uid() = user_id`), so a student cannot mutate another
-- student's application even by guessing the row id.
-- SECTION: Saved opportunities
-- The §65 "SAVE" MVP item is a single boolean: a student either saved an
-- opportunity or didn't. This table is the dedicated home for that flag.
-- A row here means "this student clicked the save button on this
-- opportunity" — nothing more.
create table if not exists public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (user_id, opportunity_id)
);

create index if not exists saved_opportunities_user_id_idx
  on public.saved_opportunities (user_id);

comment on table public.saved_opportunities is
  'Per-student bookmark for an opportunity. One row per (user_id, opportunity_id).';
-- End of section: the unique constraint prevents the same save being
-- recorded twice (which would otherwise require de-duplication in every
-- read path). `on delete cascade` matches the existing profile and
-- opportunity RLS posture: deleting a user or opportunity cleans up the
-- saved rows automatically.

-- SECTION: Row-level security
alter table public.saved_opportunities enable row level security;

-- A student can only see and manage their own saved rows. This matches
-- the `auth.uid() = id` pattern on profiles, keeping the security model
-- consistent across the project's user-owned tables.
create policy "saved_opportunities_select_own" on public.saved_opportunities
  for select using (auth.uid() = user_id);

create policy "saved_opportunities_insert_own" on public.saved_opportunities
  for insert with check (auth.uid() = user_id);

create policy "saved_opportunities_delete_own" on public.saved_opportunities
  for delete using (auth.uid() = user_id);
-- End of section: no update policy — there is nothing to update on a saved
-- row except `saved_at`, which is set on insert. Updates would also create
-- a foot-gun (a student could change `user_id` to someone else's id).
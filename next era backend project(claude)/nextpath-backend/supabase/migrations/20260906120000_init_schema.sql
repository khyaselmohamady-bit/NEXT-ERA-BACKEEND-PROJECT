-- SECTION: Extensions
-- gen_random_uuid() is used for opportunity primary keys.
create extension if not exists "pgcrypto";
-- End of section

-- SECTION: profiles
-- One row per authenticated student, keyed by their auth.users id.
-- Columns map 1:1 to EligibilityProfile in src/lib/eligibility/types.ts.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nationality_code text,
  birth_date date,
  education_level text check (
    education_level in ('SECONDARY', 'DIPLOMA', 'BACHELOR', 'MASTER', 'PHD')
  ),
  academic_year integer,
  gpa numeric,
  residency_country_code text,
  has_required_legal_authorization boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Hard-eligibility facts for one student. Maps to EligibilityProfile in src/lib/eligibility/types.ts.';
-- End of section

-- SECTION: opportunities
-- One row per scholarship/opportunity. hard_requirements stores the full
-- OpportunityHardRequirements object as JSONB rather than one column per rule,
-- since each rule is itself a Requirement<T> discriminated union
-- (EXPLICIT / AMBIGUOUS / NOT_STATED) that doesn't map cleanly to flat columns.
create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text,
  source_url text,
  hard_requirements jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.opportunities.hard_requirements is
  'Full OpportunityHardRequirements object from src/lib/eligibility/types.ts, stored as-is.';
-- End of section

-- SECTION: updated_at maintenance
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_opportunities_updated_at
  before update on public.opportunities
  for each row execute function public.set_updated_at();
-- End of section: keeps updated_at accurate without every write path having to set it manually.

-- SECTION: Row-level security
alter table public.profiles enable row level security;
alter table public.opportunities enable row level security;

-- A student can only see and edit their own profile.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Opportunities are public to read; writes are not opened to anon/authenticated
-- roles here on purpose. Until an admin role exists (a later increment),
-- inserts/updates go through a service-role client, which bypasses RLS.
create policy "opportunities_select_all" on public.opportunities
  for select using (true);
-- End of section: locks profile data to its owner while keeping opportunity listings public,
-- matching how a student would actually use this product.

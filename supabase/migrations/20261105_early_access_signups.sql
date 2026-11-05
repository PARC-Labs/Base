-- Base: opt-in early-access registrations, separate from Auth identities and memberships.
-- No service-role key or mailing provider is required in the browser.
begin;

create table public.early_access_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (
      email=lower(btrim(email))
      and char_length(email) between 6 and 254
      and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    ),
  practice text not null default 'unspecified'
    check (practice in ('unspecified','artist','designer','architect','researcher','technologist','maker','student','enthusiast','other')),
  intended_use text not null default ''
    check (char_length(intended_use)<=280),
  source text not null default 'direct'
    check (source ~ '^[a-z0-9_-]{1,40}$'),
  opt_in boolean not null check (opt_in is true),
  consent_version text not null default '2026-11-v1',
  consent_at timestamptz not null default now(),
  status text not null default 'interested'
    check (status in ('interested','invited','contacted','withdrawn')),
  created_at timestamptz not null default now()
);

create index early_access_signups_created_at_idx
  on public.early_access_signups(created_at desc);

alter table public.early_access_signups enable row level security;
alter table public.early_access_signups force row level security;

-- Public clients can submit a small, specifically scoped set of fields.
-- They cannot list, retrieve, update or delete registrations.
revoke all on public.early_access_signups from public,anon,authenticated;
grant insert(email,practice,intended_use,source,opt_in)
  on public.early_access_signups to anon,authenticated;

create policy early_access_opt_in_insert
on public.early_access_signups for insert to anon,authenticated
with check (opt_in is true and status='interested');

commit;

-- Anonymous, write-only privacy requests for early access signups.
-- Requests require manual ownership verification before personal data is changed.
begin;
create table public.early_access_privacy_requests (
 id uuid primary key default gen_random_uuid(),
 email text not null check (
  email=lower(btrim(email)) and char_length(email) between 6 and 254
  and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 ),
 request_type text not null check(request_type in ('withdraw','access','correct')),
 created_at timestamptz not null default now(),
 handled_at timestamptz
);
create index early_access_privacy_requests_created
 on public.early_access_privacy_requests(created_at desc);
alter table public.early_access_privacy_requests enable row level security;
alter table public.early_access_privacy_requests force row level security;
revoke all on public.early_access_privacy_requests from public,anon,authenticated;
grant insert(email,request_type) on public.early_access_privacy_requests to anon,authenticated;
create policy privacy_requests_insert on public.early_access_privacy_requests
 for insert to anon,authenticated with check (request_type in ('withdraw','access','correct'));
commit;

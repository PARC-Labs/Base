-- Base public form abuse controls: only a server-side Edge Function can submit.
-- Keep old anonymous INSERT grants until the new endpoint is deployed and verified.
begin;
create table if not exists private.base_form_attempts(
 id bigint generated always as identity primary key,
 fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
 email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
 form_kind text not null check (form_kind in ('signup','privacy')),
 created_at timestamptz not null default now()
);
create index if not exists base_form_attempts_by_fingerprint
 on private.base_form_attempts(fingerprint,created_at desc);
create index if not exists base_form_attempts_by_email
 on private.base_form_attempts(email_hash,created_at desc);
alter table private.base_form_attempts enable row level security;
revoke all on private.base_form_attempts from public,anon,authenticated;

create or replace function public.base_submit_public_form(
 p_kind text,p_email text,p_fingerprint text,p_email_hash text,
 p_practice text default 'unspecified',
 p_intended_use text default '',
 p_source text default 'direct',
 p_request_type text default null
) returns void
language plpgsql security definer set search_path=''
as $$
declare
 attempts_recent int;
 attempts_daily int;
 email_daily int;
begin
 if p_kind not in ('signup','privacy') or p_fingerprint !~ '^[0-9a-f]{64}$'
   or p_email_hash !~ '^[0-9a-f]{64}$' or p_email is null
   or p_email <> lower(btrim(p_email)) or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
  raise exception 'Invalid submission' using errcode='22023';
 end if;
 if p_kind='signup' and (
    p_practice not in ('unspecified','artist','designer','architect','researcher','technologist','maker','student','enthusiast','other')
    or length(p_intended_use)>280 or p_source !~ '^[a-z0-9_-]{1,40}$'
 ) then raise exception 'Invalid submission' using errcode='22023'; end if;
 if p_kind='privacy' and p_request_type not in ('withdraw','access','correct') then
  raise exception 'Invalid submission' using errcode='22023';
 end if;

 -- Serialise submissions from one fingerprint. All persistent identifiers are
 -- salted server-side hashes; raw IP addresses are not stored in Postgres.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_fingerprint,0));
 select count(*) filter(where created_at>now()-interval '10 minutes'),
        count(*) filter(where created_at>now()-interval '1 day')
 into attempts_recent,attempts_daily
 from private.base_form_attempts where fingerprint=p_fingerprint;
 select count(*) into email_daily from private.base_form_attempts
 where email_hash=p_email_hash and created_at>now()-interval '1 day';
 if attempts_recent>=8 or attempts_daily>=35 or email_daily>=4 then
  raise exception 'Too many submissions; try again later' using errcode='P0001';
 end if;

 insert into private.base_form_attempts(fingerprint,email_hash,form_kind)
 values(p_fingerprint,p_email_hash,p_kind);
 if p_kind='signup' then
  insert into public.early_access_signups(email,practice,intended_use,source,opt_in)
  values(p_email,p_practice,p_intended_use,p_source,true)
  on conflict(email) do nothing;
 else
  insert into public.early_access_privacy_requests(email,request_type)
  values(p_email,p_request_type);
 end if;
end;
$$;
revoke all on function public.base_submit_public_form(text,text,text,text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.base_submit_public_form(text,text,text,text,text,text,text,text)
 to service_role;
commit;

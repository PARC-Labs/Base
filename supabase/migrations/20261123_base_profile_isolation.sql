-- Prevent unauthenticated enumeration of future member profiles.
-- Public Spaces retain their explicit author_name metadata; no directory exists in v1.
begin;
revoke select on public.profiles from anon;
drop policy if exists profile_read on public.profiles;
create policy profile_self_read on public.profiles
 for select to authenticated
 using(id=(select auth.uid()));
commit;

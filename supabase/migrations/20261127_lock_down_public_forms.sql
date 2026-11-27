-- Base: remove the legacy public-table bypass after the Edge client rollout.
-- Production smoke test verified both new submission flows on 2026-11-27.
begin;
-- Supabase previously granted COLUMN-LEVEL INSERT permissions. Revoking only
-- table-level INSERT would leave these write routes accessible.
revoke insert(email,practice,intended_use,source,opt_in)
 on public.early_access_signups from anon,authenticated;
revoke insert(email,request_type)
 on public.early_access_privacy_requests from anon,authenticated;
revoke insert on public.early_access_signups,public.early_access_privacy_requests
 from anon,authenticated,public;

-- No UI operation deletes a Space in v1. Direct DELETE previously cascaded to
-- immutable releases and activity history. Fail closed until archival semantics exist.
revoke delete on public.spaces from authenticated,anon,public;
commit;

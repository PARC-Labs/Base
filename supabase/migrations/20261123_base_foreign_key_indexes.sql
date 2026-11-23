-- Performance hardening: index the foreign keys used by lineage and activity.
-- Idempotent. These indexes do not change access privileges or RLS policies.
create index if not exists idx_operation_logs_actor_id
  on public.operation_logs (actor_id);

create index if not exists idx_operation_logs_space_release
  on public.operation_logs (space_id, release_id);

create index if not exists idx_spaces_parent_release
  on public.spaces (parent_release_id);

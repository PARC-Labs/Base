-- Base: enable INSERT ... RETURNING for newly created private Spaces.
--
-- The existing spaces_read policy delegates private access to
-- private.can_read_space(id, auth.uid()), a STABLE function which queries
-- public.spaces. During INSERT ... RETURNING, that nested query can see a
-- snapshot from before the new Space existed. The POST inserts successfully
-- without RETURNING, but PostgREST's Prefer: return=representation fails.
--
-- Evaluate the new row's owner_id directly for active owners, retaining
-- the existing visibility and authorised-collaborator rules.
begin;

alter policy spaces_read on public.spaces using (
  visibility = 'public'
  or (
    owner_id = (select auth.uid())
    and private.active_member((select auth.uid()))
  )
  or private.can_read_space(id, (select auth.uid()))
);

commit;

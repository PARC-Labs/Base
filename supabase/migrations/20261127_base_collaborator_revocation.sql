-- Allow Space owners to inspect and revoke previously granted collaborator access.
-- No member can read the auth.user directory or alter grants for another owner.
begin;

create or replace function private.base_list_collaborators_internal(target_space_id uuid)
returns table(member_id uuid,email text)
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not private.active_member(actor) or not exists(
  select 1 from public.spaces s where s.id=target_space_id and s.owner_id=actor
 ) then raise exception 'Not authorised' using errcode='42501'; end if;
 return query
 select c.user_id,u.email::text
 from public.space_collaborators c
 join auth.users u on u.id=c.user_id
 where c.space_id=target_space_id
 order by lower(u.email);
end;
$$;

create or replace function private.base_revoke_collaborator_internal(
 target_space_id uuid,invitee_email text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if actor is null or not private.active_member(actor) or not exists(
  select 1 from public.spaces s where s.id=target_space_id and s.owner_id=actor
 ) then raise exception 'Not authorised' using errcode='42501'; end if;
 if invitee_email is null or length(btrim(invitee_email))>254 then
  raise exception 'Invalid email' using errcode='22023'; end if;
 select u.id into target from auth.users u
 where lower(u.email)=lower(btrim(invitee_email)) limit 1;
 if target is null then return false; end if;
 delete from public.space_collaborators c
 where c.space_id=target_space_id and c.user_id=target;
 return found;
end;
$$;

-- Exposed RPC wrappers are invoker rights and require an authenticated caller.
create or replace function public.base_list_collaborators(target_space_id uuid)
returns table(member_id uuid,email text)
language sql security invoker set search_path='' as $$
 select * from private.base_list_collaborators_internal(target_space_id)
$$;
create or replace function public.base_revoke_collaborator(target_space_id uuid,invitee_email text)
returns boolean
language sql security invoker set search_path='' as $$
 select private.base_revoke_collaborator_internal(target_space_id,invitee_email)
$$;
revoke all on function private.base_list_collaborators_internal(uuid),
 private.base_revoke_collaborator_internal(uuid,text),
 public.base_list_collaborators(uuid),public.base_revoke_collaborator(uuid,text)
 from public,anon,authenticated;
grant execute on function private.base_list_collaborators_internal(uuid),
 private.base_revoke_collaborator_internal(uuid,text),
 public.base_list_collaborators(uuid),public.base_revoke_collaborator(uuid,text)
 to authenticated;
commit;

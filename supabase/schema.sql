-- BASE V1 DATABASE SCHEMA
-- Apply to a NEW, dedicated Supabase project (never to Applied State).
-- Intended for the SQL Editor on an empty Supabase database.
-- IMPORTANT: admission and billing are manual in v1.

begin;
create schema if not exists private;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'Member' check (char_length(display_name) between 1 and 120),
 bio text check (char_length(bio) <= 2000),
 created_at timestamptz not null default now()
);
create table public.memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending','active','suspended')),
 created_at timestamptz not null default now()
);
create table public.spaces (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(trim(title)) between 2 and 140),
 summary text not null default '' check (length(summary) <= 2000),
 author_name text not null default 'Member' check (length(author_name) between 1 and 120),
 cover_url text check (cover_url is null or (cover_url ~ '^https://[^[:space:]]+$' and char_length(cover_url) <= 2048)),
 visibility text not null default 'private' check (visibility in ('private','public')),
 parent_release_id uuid,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.space_collaborators (
 space_id uuid not null references public.spaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (space_id,user_id)
);
create table public.materials (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.spaces(id) on delete cascade,
 type text not null check (type in ('note','link','image','component','procedure')),
 title text not null check (char_length(title) between 1 and 180),
 url text check (url is null or (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 2048)),
 body text check (body is null or char_length(body) <= 10000),
 position bigint generated always as identity,
 created_at timestamptz not null default now(),
 constraint material_shape check (
  (type in ('note','component','procedure') and body is not null and trim(body)<>'' and url is null)
  or (type in ('link','image') and url is not null)
 )
);
create table public.releases (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.spaces(id) on delete cascade,
 version int not null check(version>0),
 snapshot jsonb not null,
 created_at timestamptz not null default now(),
 unique(space_id,version)
);
-- The composite foreign key prevents an operational event from referencing
-- a release belonging to another Space.
create unique index releases_space_id_id_uidx on public.releases(space_id,id);
create table public.operation_logs (
 id uuid primary key default gen_random_uuid(),
 space_id uuid not null references public.spaces(id) on delete cascade,
 release_id uuid not null,
 actor_id uuid not null references auth.users(id),
 title text not null check (char_length(btrim(title)) between 2 and 180),
 details text not null default '' check (char_length(details) <= 5000),
 created_at timestamptz not null default now(),
 constraint operation_logs_space_release_fk foreign key(space_id,release_id)
   references public.releases(space_id,id) on delete cascade
);
alter table public.spaces add constraint spaces_parent_release_fk
 foreign key (parent_release_id) references public.releases(id) on delete set null;

create index idx_spaces_owner on public.spaces(owner_id,updated_at desc);
create index idx_spaces_public on public.spaces(updated_at desc) where visibility='public';
create index idx_materials_space on public.materials(space_id,position);
create index idx_collaborators_user on public.space_collaborators(user_id,space_id);
create index idx_releases_space on public.releases(space_id,version desc);
create index idx_operation_logs_space on public.operation_logs(space_id,created_at desc);

create function private.active_member(target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
 select target_user_id is not null and exists(
  select 1 from public.memberships m where m.user_id=target_user_id and m.status='active'
 );
$$;
create function private.can_read_space(target_space_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(
  select 1 from public.spaces s
  where s.id=target_space_id
   and (s.visibility='public' or (
    private.active_member(target_user_id) and (
     s.owner_id=target_user_id or exists(
      select 1 from public.space_collaborators c where c.space_id=s.id and c.user_id=target_user_id
     )
    )
   ))
 );
$$;
create function private.can_edit_space(target_space_id uuid,target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
 select private.active_member(target_user_id) and exists(
  select 1 from public.spaces s where s.id=target_space_id
   and (s.owner_id=target_user_id or exists(
    select 1 from public.space_collaborators c where c.space_id=s.id and c.user_id=target_user_id
   ))
 );
$$;
create function private.set_space_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now();return new;end;
$$;
create trigger spaces_updated_at before update on public.spaces
for each row execute function private.set_space_updated_at();
create function private.bump_space_from_material()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.spaces set updated_at=now()
 where id=coalesce(new.space_id,old.space_id);
 return coalesce(new,old);
end;
$$;
create trigger materials_bump_space after insert or update or delete on public.materials
for each row execute function private.bump_space_from_material();

-- New email identities may verify an account, but only explicitly pre-approved
-- addresses receive an active membership. Admission data is never exposed via REST.
create table private.approved_member_emails (
 email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 320),
 approved_at timestamptz not null default now()
);
revoke all on private.approved_member_emails from public, anon, authenticated;
alter table private.approved_member_emails enable row level security;

create function private.create_profile()
returns trigger language plpgsql security definer set search_path='' as $
declare is_approved boolean;
begin
 select exists(
  select 1 from private.approved_member_emails a
  where a.email = lower(btrim(new.email))
 ) into is_approved;
 insert into public.profiles(id,display_name) values(new.id,'Member') on conflict do nothing;
 insert into public.memberships(user_id,status)
 values(new.id,case when is_approved then 'active' else 'pending' end)
 on conflict do nothing;
 return new;
end;
$;
create trigger auth_profile_created after insert on auth.users
for each row execute function private.create_profile();

-- A release is an immutable snapshot. Only an active owner can publish a release.
create function private.release_space_internal(target_space_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item record; next_version int; new_id uuid; snapshot_data jsonb;
begin
 if not private.active_member(actor) or not exists(
  select 1 from public.spaces where id=target_space_id and owner_id=actor
 ) then raise exception 'Not authorised' using errcode='42501';end if;
 perform 1 from public.spaces where id=target_space_id for update;
 select coalesce(max(version),0)+1 into next_version from public.releases where space_id=target_space_id;
 select jsonb_build_object(
  'title',s.title,'summary',s.summary,'cover_url',s.cover_url,'author_name',s.author_name,
  'materials',coalesce((select jsonb_agg(jsonb_build_object(
    'type',m.type,'title',m.title,'url',m.url,'body',m.body
  ) order by m.position) from public.materials m where m.space_id=s.id),'[]'::jsonb)
 ) into snapshot_data from public.spaces s where s.id=target_space_id;
 insert into public.releases(space_id,version,snapshot)
 values(target_space_id,next_version,snapshot_data) returning id into new_id;
 return new_id;
end;
$$;
create function private.fork_release_internal(target_release_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r record; new_space uuid; material jsonb;
begin
 if not private.active_member(actor) then raise exception 'Active membership required' using errcode='42501';end if;
 select rel.id, rel.snapshot, s.visibility into r
 from public.releases rel join public.spaces s on s.id=rel.space_id
 where rel.id=target_release_id;
 if not found or r.visibility<>'public' then raise exception 'This release is not forkable' using errcode='42501';end if;
 insert into public.spaces(owner_id,title,summary,author_name,cover_url,visibility,parent_release_id)
 values(actor,left(coalesce(r.snapshot->>'title','Untitled')||' — fork',140),
  coalesce(r.snapshot->>'summary',''),
  coalesce((select display_name from public.profiles where id=actor),'Member'),
  nullif(r.snapshot->>'cover_url',''),'private',target_release_id)
 returning id into new_space;
 for material in select value from jsonb_array_elements(coalesce(r.snapshot->'materials','[]'::jsonb)) as t(value)
 loop
  insert into public.materials(space_id,type,title,url,body)
  values(new_space,material->>'type',material->>'title',nullif(material->>'url',''),nullif(material->>'body',''));
 end loop;
 return new_space;
end;
$$;
create function private.invite_space_collaborator_internal(target_space_id uuid,invitee_email text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); invitee uuid;
begin
 if not private.active_member(actor) or not exists(
  select 1 from public.spaces where id=target_space_id and owner_id=actor
 ) then raise exception 'Not authorised' using errcode='42501';end if;
 select u.id into invitee from auth.users u
 join public.memberships m on m.user_id=u.id and m.status='active'
 where lower(u.email)=lower(trim(invitee_email)) limit 1;
 if invitee is null then raise exception 'No eligible member found' using errcode='22023';end if;
 if invitee=actor then raise exception 'You already own this Space' using errcode='22023';end if;
 insert into public.space_collaborators(space_id,user_id)
 values(target_space_id,invitee) on conflict do nothing;
end;
$$;

-- Exposed RPC entrypoints execute with caller rights; privileged logic stays outside API schemas.
create function public.release_space(target_space_id uuid) returns uuid
 language sql security invoker set search_path='' as $$select private.release_space_internal(target_space_id)$$;
create function public.fork_release(target_release_id uuid) returns uuid
 language sql security invoker set search_path='' as $$select private.fork_release_internal(target_release_id)$$;
create function public.invite_space_collaborator(target_space_id uuid,invitee_email text) returns void
 language sql security invoker set search_path='' as $$select private.invite_space_collaborator_internal(target_space_id,invitee_email)$$;

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.spaces enable row level security;
alter table public.space_collaborators enable row level security;
alter table public.materials enable row level security;
alter table public.releases enable row level security;
alter table public.operation_logs enable row level security;
alter table public.profiles force row level security;
alter table public.memberships force row level security;
alter table public.spaces force row level security;
alter table public.space_collaborators force row level security;
alter table public.materials force row level security;
alter table public.releases force row level security;
alter table public.operation_logs force row level security;

revoke all on public.profiles,public.memberships,public.spaces,
 public.space_collaborators,public.materials,public.releases,public.operation_logs from public,anon,authenticated;
grant select on public.profiles to anon,authenticated;
grant update(display_name,bio) on public.profiles to authenticated;
grant select on public.memberships to authenticated;
grant select on public.spaces,public.materials,public.releases to anon,authenticated;
-- Do not allow browser inserts or updates to forge a fork parent, owner,
-- or attribution after creation. Only trusted server RPC can set lineage.
grant insert(owner_id,title,summary,author_name,cover_url,visibility),
 update(title,summary,cover_url,visibility), delete on public.spaces to authenticated;
grant insert,update,delete on public.materials to authenticated;
grant select on public.operation_logs to anon,authenticated;
grant insert(space_id,release_id,actor_id,title,details) on public.operation_logs to authenticated;
grant select on public.space_collaborators to authenticated;

create policy profile_read on public.profiles for select to anon,authenticated using(true);
create policy profile_update on public.profiles for update to authenticated
 using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy memberships_self on public.memberships for select to authenticated
 using(user_id=(select auth.uid()));
create policy spaces_read on public.spaces for select to anon,authenticated
 using(visibility='public' or private.can_read_space(id,(select auth.uid())));
create policy spaces_insert on public.spaces for insert to authenticated
 with check(owner_id=(select auth.uid()) and private.active_member((select auth.uid())));
create policy spaces_update on public.spaces for update to authenticated
 using(owner_id=(select auth.uid()) and private.active_member((select auth.uid())))
 with check(owner_id=(select auth.uid()) and private.active_member((select auth.uid())));
create policy spaces_delete on public.spaces for delete to authenticated
 using(owner_id=(select auth.uid()) and private.active_member((select auth.uid())));
create policy collaborators_read on public.space_collaborators for select to authenticated
 using(user_id=(select auth.uid()) or exists(
  select 1 from public.spaces s where s.id=space_id and s.owner_id=(select auth.uid())
 ));
create policy materials_read on public.materials for select to anon,authenticated
 using(private.can_read_space(space_id,(select auth.uid())));
create policy materials_insert on public.materials for insert to authenticated
 with check(private.can_edit_space(space_id,(select auth.uid())));
create policy materials_update on public.materials for update to authenticated
 using(private.can_edit_space(space_id,(select auth.uid())))
 with check(private.can_edit_space(space_id,(select auth.uid())));
create policy materials_delete on public.materials for delete to authenticated
 using(private.can_edit_space(space_id,(select auth.uid())));
create policy releases_read on public.releases for select to anon,authenticated
 using(private.can_read_space(space_id,(select auth.uid())));
-- Append-only operational records are always tied to an immutable release.
-- Only authorised, active contributors may add records; nobody may edit history.
create policy operation_logs_read on public.operation_logs for select to anon,authenticated
 using(private.can_read_space(space_id,(select auth.uid())));
create policy operation_logs_insert on public.operation_logs for insert to authenticated
 with check(actor_id=(select auth.uid())
  and private.can_edit_space(space_id,(select auth.uid())));

revoke all on function private.active_member(uuid),private.can_read_space(uuid,uuid),
 private.can_edit_space(uuid,uuid),private.release_space_internal(uuid),
 private.fork_release_internal(uuid),private.invite_space_collaborator_internal(uuid,text)
 from public,anon,authenticated;
revoke all on function public.release_space(uuid),public.fork_release(uuid),
 public.invite_space_collaborator(uuid,text) from public,anon,authenticated;
grant usage on schema private to anon,authenticated;
grant execute on function private.active_member(uuid),private.can_read_space(uuid,uuid) to anon,authenticated;
grant execute on function private.can_edit_space(uuid,uuid),private.release_space_internal(uuid),
 private.fork_release_internal(uuid),private.invite_space_collaborator_internal(uuid,text) to authenticated;
grant execute on function public.release_space(uuid),public.fork_release(uuid),
 public.invite_space_collaborator(uuid,text) to authenticated;

-- Profiles cannot grant themselves a membership. Only trusted SQL administration can.
-- To activate an invited account, run in SQL Editor after verifying identity:
-- update public.memberships set status='active' where user_id='<USER_UUID>';
commit;

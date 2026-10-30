-- Base: private images and PDF uploads. Applied to the dedicated Base project.
-- No paid media service, public bucket or privileged browser credentials.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('base-media','base-media',false,5242880,
 array['image/webp','image/jpeg','image/png','application/pdf']::text[])
on conflict(id) do update set public=false,
 file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.materials add column storage_path text;
alter table public.materials drop constraint material_shape;
alter table public.materials drop constraint materials_type_check;
alter table public.materials add constraint materials_type_check
 check(type in('note','link','image','file','component','procedure'));
alter table public.materials add constraint materials_storage_path_shape
 check(storage_path is null or storage_path ~
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|pdf)$');
alter table public.materials add constraint material_shape check(
 (type in('note','component','procedure') and body is not null and btrim(body)<>'' and url is null and storage_path is null)
 or (type in('link','image') and url is not null and storage_path is null)
 or (type in('image','file') and storage_path is not null and url is null)
);
alter table public.materials add constraint material_upload_ownership
 check(storage_path is null or split_part(storage_path,'/',1)=space_id::text);

create policy base_media_read on storage.objects for select to anon,authenticated
using(bucket_id='base-media'
 and case when split_part(name,'/',1) ~
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then private.can_read_space(split_part(name,'/',1)::uuid,(select auth.uid()))
 else false end);
create policy base_media_upload on storage.objects for insert to authenticated
with check(bucket_id='base-media'
 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](webp|pdf)$'
 and case when split_part(name,'/',1) ~
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then private.can_edit_space(split_part(name,'/',1)::uuid,(select auth.uid()))
 else false end);
create policy base_media_delete on storage.objects for delete to authenticated
using(bucket_id='base-media'
 and case when split_part(name,'/',1) ~
 '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then private.can_edit_space(split_part(name,'/',1)::uuid,(select auth.uid()))
 else false end);

-- Every published release retains its original media references.
create or replace function private.release_space_internal(target_space_id uuid)
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
    'type',m.type,'title',m.title,'url',m.url,'body',m.body,'storage_path',m.storage_path
  ) order by m.position) from public.materials m where m.space_id=s.id),'[]'::jsonb)
 ) into snapshot_data from public.spaces s where s.id=target_space_id;
 insert into public.releases(space_id,version,snapshot)
 values(target_space_id,next_version,snapshot_data) returning id into new_id;
 return new_id;
end;
$$;
-- Forked media is represented as a source link, not secretly duplicated.
create or replace function private.fork_release_internal(target_release_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r record; new_space uuid; material jsonb;
begin
 if not private.active_member(actor) then raise exception 'Active membership required' using errcode='42501';end if;
 select rel.id, rel.space_id, rel.snapshot, s.visibility into r
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
  if nullif(material->>'storage_path','') is not null then
   insert into public.materials(space_id,type,title,url,body)
   values(new_space,'link',material->>'title',
    'https://parc-labs.github.io/Base/#space/'||r.space_id::text,
    'Uploaded media is held in the source Space. Open it there to view the original.');
  else
   insert into public.materials(space_id,type,title,url,body)
   values(new_space,material->>'type',material->>'title',nullif(material->>'url',''),nullif(material->>'body',''));
  end if;
 end loop;
 return new_space;
end;
$$;
commit;

-- BASE: linked Spaces / first organisation layer
-- Additive migration for the existing dedicated Base project only.
begin;

create table public.space_links (
 id uuid primary key default gen_random_uuid(),
 source_space_id uuid not null references public.spaces(id) on delete cascade,
 target_space_id uuid not null references public.spaces(id) on delete cascade,
 note text not null default '' check (char_length(note) <= 500),
 created_at timestamptz not null default now(),
 constraint space_links_distinct check(source_space_id <> target_space_id),
 constraint space_links_unique unique(source_space_id,target_space_id)
);
create index idx_space_links_target on public.space_links(target_space_id,created_at desc);
alter table public.space_links enable row level security;
alter table public.space_links force row level security;
revoke all on public.space_links from public,anon,authenticated;
grant select on public.space_links to anon,authenticated;
grant insert(source_space_id,target_space_id,note),delete on public.space_links to authenticated;

-- Reference metadata is visible only when both Spaces themselves are visible.
create policy space_links_read on public.space_links for select to anon,authenticated
using(
 private.can_read_space(source_space_id,(select auth.uid())) and
 private.can_read_space(target_space_id,(select auth.uid()))
);
-- An active editor of the source may connect any Space they are entitled to read.
create policy space_links_insert on public.space_links for insert to authenticated
with check(
 private.can_edit_space(source_space_id,(select auth.uid())) and
 private.can_read_space(target_space_id,(select auth.uid()))
);
create policy space_links_delete on public.space_links for delete to authenticated
using(private.can_edit_space(source_space_id,(select auth.uid())));

commit;
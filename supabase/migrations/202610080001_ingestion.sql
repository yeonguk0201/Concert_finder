-- Candidate metadata never publishes concerts or infers announcement dates.
create table public.collection_runs (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(),
  candidate_count integer not null, failures jsonb not null
);
create table public.collection_candidates (
  id uuid primary key default gen_random_uuid(), source_url text not null unique,
  payload jsonb not null, previous_payload jsonb, content_hash text not null,
  revision integer not null default 1, fetched_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  check (source_url ~ '^https://ualive\.com/concerts/[0-9]+$')
);
alter table public.collection_candidates enable row level security;
alter table public.collection_runs enable row level security;
grant select on public.collection_candidates, public.collection_runs to authenticated;
create policy admin_candidates on public.collection_candidates for select to authenticated using (private.is_admin());
create policy admin_runs on public.collection_runs for select to authenticated using (private.is_admin());

create function public.admin_ingest_ualive(batch jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  if not private.is_admin() and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role','') <> 'service_role' then raise exception 'ADMIN_REQUIRED'; end if;
  if jsonb_typeof(batch->'candidates') <> 'array' or jsonb_array_length(batch->'candidates') > 50
    or jsonb_typeof(batch->'failures') <> 'array' then raise exception 'INVALID_BATCH'; end if;
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    if length(item->>'content_hash') <> 64 or jsonb_typeof(item->'payload') <> 'object' then raise exception 'INVALID_CANDIDATE'; end if;
    insert into public.collection_candidates(source_url,payload,content_hash)
      values (item->>'source_url',item->'payload',item->>'content_hash')
    on conflict(source_url) do update set
      previous_payload = case when collection_candidates.content_hash <> excluded.content_hash then collection_candidates.payload else collection_candidates.previous_payload end,
      payload = excluded.payload, content_hash = excluded.content_hash, fetched_at = now(),
      revision = collection_candidates.revision + case when collection_candidates.content_hash <> excluded.content_hash then 1 else 0 end,
      status = case when collection_candidates.content_hash <> excluded.content_hash then 'pending' else collection_candidates.status end;
  end loop;
  insert into public.collection_runs(candidate_count,failures) values (jsonb_array_length(batch->'candidates'),batch->'failures');
end $$;
revoke all on function public.admin_ingest_ualive(jsonb) from public;
grant execute on function public.admin_ingest_ualive(jsonb) to authenticated,service_role;

create function public.admin_resolve_candidate(candidate_id uuid, expected_revision integer, resolution text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if resolution not in ('reviewed','dismissed') then raise exception 'INVALID_RESOLUTION'; end if;
  update public.collection_candidates set status=resolution where id=candidate_id and revision=expected_revision;
  if not found then raise exception 'EDIT_CONFLICT'; end if;
end $$;
revoke all on function public.admin_resolve_candidate(uuid,integer,text) from public;
grant execute on function public.admin_resolve_candidate(uuid,integer,text) to authenticated;

-- Proposed SQL, not installed. Both new policy switches start OFF; no scheduler.
-- Extend the current constraint expression instead of replacing other sources.
do $$
declare definition text;
begin
  select pg_get_expr(c.conbin,c.conrelid) into strict definition from pg_constraint c
    where c.conrelid='public.collection_candidates'::regclass and c.conname='collection_candidates_source_url_check';
  alter table public.collection_candidates drop constraint collection_candidates_source_url_check;
  execute 'alter table public.collection_candidates add constraint collection_candidates_source_url_check check (('
    || definition || ') or source_url ~ ''^https://reissuerecords[.]net/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9-]+/$'')';
  select pg_get_expr(c.conbin,c.conrelid) into strict definition from pg_constraint c
    where c.conrelid='public.collection_policies'::regclass and c.conname='collection_policies_source_check';
  alter table public.collection_policies drop constraint collection_policies_source_check;
  execute 'alter table public.collection_policies add constraint collection_policies_source_check check (('
    || definition || ') or source=''reissue_nol'')';
end $$;
insert into public.collection_policies(source,collection_enabled,publication_enabled,adapter_version)
  values('reissue_nol',false,false,'reissue-nol-review-v1') on conflict(source) do nothing;

-- Preserve the deployed ingestion implementation for all existing sources.
alter function public.admin_ingest_catalog(text,jsonb,jsonb) set schema private;
alter function private.admin_ingest_catalog(text,jsonb,jsonb) rename to ingest_catalog_before_reissue;
revoke all on function private.ingest_catalog_before_reissue(text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.admin_ingest_catalog(source text,batch jsonb,identities jsonb default '[]') returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; proposed jsonb; ids jsonb; identity_count integer;
begin
  if not private.is_admin() and coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'ADMIN_REQUIRED'; end if;
  if source is distinct from 'reissue_nol' then
    perform private.ingest_catalog_before_reissue(source,batch,identities); return;
  end if;
  if identities is distinct from '[]'::jsonb or jsonb_typeof(batch->'candidates') is distinct from 'array'
    or jsonb_array_length(batch->'candidates')>40 or jsonb_typeof(batch->'failures') is distinct from 'array'
    then raise exception 'INVALID_BATCH'; end if;
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    if coalesce(item->>'source_url','') !~ '^https://reissuerecords[.]net/[0-9]{4}/[0-9]{2}/[0-9]{2}/[a-z0-9-]+/$'
      or coalesce(item->>'content_hash','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(item->'payload') is distinct from 'object'
      or jsonb_typeof(item->'payload'->'artist_keys') is distinct from 'array'
      or jsonb_array_length(item->'payload'->'artist_keys')<>1 then raise exception 'INVALID_CANDIDATE'; end if;
    select coalesce(jsonb_agg(i.band_id),'[]'),count(*) into ids,identity_count
      from private.artist_identities i where i.identity_key=item->'payload'->'artist_keys'->>0;
    proposed:=item->'payload'||jsonb_build_object('band_ids',ids,'status','review','initial_import',true);
    if identity_count<>1 then proposed:=proposed||jsonb_build_object('review_reasons',
      coalesce(proposed->'review_reasons','[]')||'["ARTIST_IDENTITY_UNCONFIRMED"]'::jsonb); end if;
    -- This version deliberately requires live verification before any automated
    -- publication; even a caller-provided payload cannot bypass that release gate.
    proposed:=proposed||jsonb_build_object('review_reasons',coalesce(proposed->'review_reasons','[]')||'["LIVE_LAYOUT_AND_TERMS_UNVERIFIED"]'::jsonb);
    insert into public.collection_candidates(source_url,payload,content_hash)
      values(item->>'source_url',proposed,item->>'content_hash') on conflict(source_url) do update set
      previous_payload=case when collection_candidates.content_hash<>excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids'
        then collection_candidates.payload else collection_candidates.previous_payload end,
      payload=excluded.payload,content_hash=excluded.content_hash,fetched_at=clock_timestamp(),
      revision=collection_candidates.revision+case when collection_candidates.content_hash<>excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids' then 1 else 0 end,
      status=case when collection_candidates.content_hash<>excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids' then 'pending' else collection_candidates.status end;
  end loop;
  insert into public.collection_runs(source,candidate_count,failures,excluded)
    values(source,jsonb_array_length(batch->'candidates'),batch->'failures',coalesce(batch->'excluded','[]'));
end $$;
revoke all on function public.admin_ingest_catalog(text,jsonb,jsonb) from public,anon;
grant execute on function public.admin_ingest_catalog(text,jsonb,jsonb) to authenticated,service_role;

-- Expand the same CAS executor to reviewed batches; retain raw quarantine,
-- manual decisions, identity approval, duplicate checks and silent delivery.
begin;
select source from public.collection_policies order by source for update;
do $migration$
declare definition text; changed text; old_guard text; new_guard text;
begin
  if exists(select 1 from private.collection_leases where expires_at>clock_timestamp()) then raise exception 'IDLE_REQUIRED'; end if;
  definition:=pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure);
  if md5(definition)<>'6f2ffc04f241bfb76e8c9da6b3b3599b' then raise exception 'EXECUTOR_CHANGED_SINCE_REVIEW'; end if;
  old_guard:=$old$or existing_candidate.content_hash is distinct from item->>'content_hash'
        or existing_candidate.payload is distinct from item->'payload' then raise exception 'REVIEWED_CANDIDATE_CHANGED'; end if;$old$;
  new_guard:=$new$then raise exception 'REVIEWED_CANDIDATE_CHANGED'; end if;
      if item->'automatic_enrichment'='true'::jsonb then
        if run.source<>'kopis' or not policy.publication_enabled or policy.live_after is not null
          or item->'payload'->'initial_import' is distinct from 'true'::jsonb
          or private.publication_facts_reason(item->'payload',existing_candidate.source_url,clock_timestamp()) is not null
          or exists(select 1 from unnest(array['title','format','country_code','city','venue','starts_on','ends_on','cancelled']) k
            where existing_candidate.payload->k is distinct from item->'payload'->k)
          or (existing_candidate.payload->'announcement_verified'='true'::jsonb and exists(
            select 1 from unnest(array['announced_on','announced_at','announcement_precision','announcement_verified']) k
            where existing_candidate.payload->k is distinct from item->'payload'->k))
          or (nullif(existing_candidate.payload#>>'{ticket,opens_at}','') is not null
            and existing_candidate.payload#>>'{ticket,opens_at}' is distinct from item#>>'{payload,ticket,opens_at}')
          or not (coalesce(item#>'{payload,sessions}','[]') @> coalesce(existing_candidate.payload->'sessions','[]'))
          or exists(select 1 from jsonb_array_elements(coalesce(existing_candidate.payload->'sources','[]')) s
            where nullif(s->>'verified_at','') is not null and not exists(
              select 1 from jsonb_array_elements(item#>'{payload,sources}') n where n->>'url'=s->>'url' and nullif(n->>'verified_at','') is not null))
          or not (coalesce(item#>'{payload,artist_keys}','[]') @> coalesce(existing_candidate.payload->'artist_keys','[]'))
          or not (coalesce(item#>'{payload,band_ids}','[]') @> coalesce(existing_candidate.payload->'band_ids','[]'))
          then raise exception 'REVIEWED_ENRICHMENT_INVALID'; end if;
      elsif existing_candidate.content_hash is distinct from item->>'content_hash'
        or existing_candidate.payload is distinct from item->'payload' then raise exception 'REVIEWED_CANDIDATE_CHANGED'; end if;$new$;
  changed:=replace(definition,old_guard,new_guard);
  -- Preserve every verified attribution link, not only the discovery source.
  changed:=replace(changed,$oldsrc$insert into public.concert_sources(concert_id,url,label,verified_at)
          values(target,candidate.source_url,run.source,(select (s->>'verified_at')::timestamptz from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url limit 1));$oldsrc$,
    $newsrc$insert into public.concert_sources(concert_id,url,label,verified_at)
          select distinct on(s->>'url') target,s->>'url',coalesce(nullif(s->>'label',''),run.source),(s->>'verified_at')::timestamptz
          from jsonb_array_elements(p->'sources') s where private.publication_instant(s->>'verified_at');$newsrc$);
  if changed=definition or position('REVIEWED_ENRICHMENT_INVALID' in changed)=0
    or position('select distinct on(s->>''url'') target' in changed)=0 then raise exception 'CONTINUOUS_PATCH_CONTEXT_CHANGED'; end if;
  execute changed;
end $migration$;
create or replace function public.service_publication_capabilities() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  return jsonb_build_object('contract','publication-facts-v3','reviewed_release',true,'continuous_review',true,
    'executor_md5',md5(pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure)));
end $$;
revoke all on function public.service_publication_capabilities() from public,anon,authenticated;
grant execute on function public.service_publication_capabilities() to service_role;
commit;

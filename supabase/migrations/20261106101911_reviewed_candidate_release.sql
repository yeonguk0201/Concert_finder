-- Complete the existing silent source path. No policy or data rows are changed
-- by installation. Preserve reviewed facts even when an older collector runs.
begin;
select source from public.collection_policies order by source for update;
do $migration$
declare definition text; guarded text;
begin
  if exists(select 1 from public.collection_policies where publication_enabled or live_after is not null)
    or exists(select 1 from private.collection_leases where expires_at>clock_timestamp()) then
    raise exception 'PUBLICATION_OFF_AND_IDLE_REQUIRED'; end if;
  definition:=pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure);
  if md5(definition)<>'bc62c4d59626b677a1b6a26b3f50bb7a' then raise exception 'EXECUTOR_CHANGED_SINCE_REVIEW'; end if;
  guarded:=replace(definition,'previous_setting text;',
    'previous_setting text; existing_candidate public.collection_candidates; retained jsonb; input_count integer;');
  guarded:=replace(guarded,'perform public.admin_ingest_catalog(run.source,batch,identities);',$patch$
  input_count:=jsonb_array_length(batch->'candidates'); retained:='[]'::jsonb;
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    select * into existing_candidate from public.collection_candidates where source_url=item->>'source_url' for update;
    if item ? 'reviewed_revision' or item ? 'reviewed_content_hash' then
      -- Compare under the same row lock used for ingestion and publication.
      if existing_candidate.id is null or existing_candidate.automation_blocked or existing_candidate.status<>'pending'
        or existing_candidate.revision is distinct from (item->>'reviewed_revision')::integer
        or existing_candidate.content_hash is distinct from item->>'reviewed_content_hash'
        or existing_candidate.content_hash is distinct from item->>'content_hash'
        or existing_candidate.payload is distinct from item->'payload' then raise exception 'REVIEWED_CANDIDATE_CHANGED'; end if;
      retained:=retained||jsonb_build_array(item);
    elsif existing_candidate.id is not null
      and (existing_candidate.payload->'announcement_verified'='true'::jsonb
        or jsonb_array_length(coalesce(existing_candidate.payload->'sessions','[]'))>0
        or nullif(existing_candidate.payload#>>'{ticket,opens_at}','') is not null)
      and exists(select 1 from unnest(array['title','format','country_code','city','venue','starts_on','ends_on',
        'cancelled','artist_keys','band_ids','sessions','announced_on','announced_at','announcement_precision',
        'announcement_verified','ticket','ticket_evidence','sources']) as field(key)
        where existing_candidate.payload->field.key is distinct from item->'payload'->field.key) then
      batch:=jsonb_set(batch,'{failures}',coalesce(batch->'failures','[]')||jsonb_build_array(
        jsonb_build_object('source_url',existing_candidate.source_url,'error','REVIEWED_FACT_REGRESSION')));
      insert into public.collection_decisions(run_id,candidate_id,revision,policy_version,outcome,reason)
        values(run_token,existing_candidate.id,existing_candidate.revision,policy.adapter_version,'review','REVIEWED_FACT_REGRESSION');
      reviews:=reviews+1;
    else retained:=retained||jsonb_build_array(item);
    end if;
  end loop;
  batch:=jsonb_set(batch,'{candidates}',retained);
  perform public.admin_ingest_catalog(run.source,batch,identities);$patch$);
  guarded:=replace(guarded,$gate$elsif run.source='reissue_nol' then reason:='OPTIONAL_NOL_DEPENDENCY';$gate$,
    $gate$elsif run.source='reissue_nol' then reason:='OPTIONAL_NOL_DEPENDENCY';
    elsif run.source='kopis' and policy.live_after is null and not (item ? 'reviewed_revision')
      then reason:='REVIEWED_RELEASE_TARGET_REQUIRED';$gate$);
  guarded:=replace(guarded,$count$candidate_count=jsonb_array_length(batch->'candidates'),failures=batch->'failures'$count$,
    $count$candidate_count=input_count,failures=batch->'failures'$count$);
  if guarded=definition or position('REVIEWED_CANDIDATE_CHANGED' in guarded)=0
    or position('REVIEWED_RELEASE_TARGET_REQUIRED' in guarded)=0 or position('candidate_count=input_count' in guarded)=0
    then raise exception 'REVIEWED_RELEASE_PATCH_CONTEXT_CHANGED'; end if;
  execute guarded;
end $migration$;
create or replace function public.service_publication_capabilities() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role'
    then raise exception 'SERVICE_REQUIRED'; end if;
  return jsonb_build_object('contract','publication-facts-v3','reviewed_release',true,'executor_md5',
    md5(pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure)));
end $$;
revoke all on function public.service_publication_capabilities() from public,anon,authenticated;
grant execute on function public.service_publication_capabilities() to service_role;
revoke all on function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) to service_role;
commit;


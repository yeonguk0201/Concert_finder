-- REVIEW PROPOSAL ONLY. Not deployed; does not enable policies or end backfill.
-- Apply atomically after separate operational review and migration preparation.
begin;

create or replace function private.publication_day(value text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return coalesce(value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and value::date::text=value,false);
exception when data_exception then return false;
end $$;

create or replace function private.publication_instant(value text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  return coalesce(value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9]([.][0-9]+)?)?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$'
    and private.publication_day(left(value,10)) and isfinite(value::timestamptz),false);
exception when data_exception then return false;
end $$;

-- Pure fact validation. Service-supplied evidence is a contract, not a grant of
-- source permission. Terms/adapter verification still precedes activation.
create or replace function private.publication_facts_reason(p jsonb, source_url text, checked_at timestamptz) returns text
language plpgsql stable set search_path='' as $$
declare session_record jsonb; e jsonb; sale timestamptz; evidence_found boolean:=false;
begin
  if jsonb_typeof(p) is distinct from 'object' or p->'cancelled' is distinct from 'false'::jsonb
    or coalesce(btrim(p->>'title'),'')='' or p->>'format' not in ('solo','festival')
    or p->>'format' is null then return 'INVALID_EVENT'; end if;
  if p->>'country_code' is distinct from 'KR' or coalesce(btrim(p->>'city'),'')=''
    or coalesce(btrim(p->>'venue'),'')='' then return 'KOREA_VENUE_UNVERIFIED'; end if;
  if not private.publication_day(p->>'starts_on') or not private.publication_day(coalesce(p->>'ends_on',p->>'starts_on'))
    then return 'DATE_UNVERIFIED_OR_PAST'; end if;
  if (p->>'starts_on')::date > coalesce(p->>'ends_on',p->>'starts_on')::date
    or coalesce(p->>'ends_on',p->>'starts_on')::date < (checked_at at time zone 'Asia/Seoul')::date
    then return 'DATE_UNVERIFIED_OR_PAST'; end if;
  if p->'announcement_verified' is distinct from 'true'::jsonb or not private.publication_instant(p->>'announced_at')
    or not private.publication_day(p->>'announced_on') then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
  if (p->>'announced_at')::timestamptz > checked_at
    or (p->>'announced_on')::date <> ((p->>'announced_at')::timestamptz at time zone 'Asia/Seoul')::date
    then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
  if jsonb_typeof(p->'review_reasons') is distinct from 'array' then return 'PARSER_REVIEW_REQUIRED'; end if;
  if jsonb_array_length(p->'review_reasons')<>0 then return 'PARSER_REVIEW_REQUIRED'; end if;
  if jsonb_typeof(p->'sessions') is distinct from 'array' then return 'SESSIONS_UNVERIFIED'; end if;
  if jsonb_array_length(p->'sessions')=0 then return 'SESSIONS_UNVERIFIED'; end if;
  for session_record in select value from jsonb_array_elements(p->'sessions') loop
    if not private.publication_instant(session_record->>'starts_at') or not private.publication_day(session_record->>'starts_on')
      then return 'SESSIONS_UNVERIFIED'; end if;
    if (session_record->>'starts_on')::date <> ((session_record->>'starts_at')::timestamptz at time zone 'Asia/Seoul')::date
      or (session_record->>'starts_on')::date not between (p->>'starts_on')::date and coalesce(p->>'ends_on',p->>'starts_on')::date
      then return 'SESSIONS_UNVERIFIED'; end if;
  end loop;
  if (select count(*)<>count(distinct (value->>'starts_at')::timestamptz) from jsonb_array_elements(p->'sessions'))
    then return 'SESSIONS_UNVERIFIED'; end if;
  if jsonb_typeof(p->'sources') is distinct from 'array' or jsonb_typeof(p->'ticket_evidence') is distinct from 'array'
    then return 'SOURCE_UNVERIFIED'; end if;
  -- A NOL booking destination is not NOL-acquired evidence. Do not inspect it here.
  if exists(select 1 from (
      select source_url as url union all select value->>'url' from jsonb_array_elements(p->'sources')
      union all select value->>'source_url' from jsonb_array_elements(p->'ticket_evidence')
    ) links where url ~* '^https?://([^/@]*[.])?(nol[.]com|nol[.]yanolja[.]com|interpark[.]com)[.]?([:/?#]|$)')
    then return 'OPTIONAL_NOL_DEPENDENCY'; end if;
  if not exists(select 1 from jsonb_array_elements(p->'sources') s where s->>'url'=source_url
    and private.publication_instant(s->>'verified_at') and (s->>'verified_at')::timestamptz<=checked_at)
    then return 'SOURCE_UNVERIFIED'; end if;
  if not private.publication_instant(p->'ticket'->>'opens_at') then return 'GENERAL_SALE_UNVERIFIED'; end if;
  sale:=(p->'ticket'->>'opens_at')::timestamptz;
  if exists(select 1 from jsonb_array_elements(p->'sessions') s where sale>(s->>'starts_at')::timestamptz)
    then return 'GENERAL_SALE_UNVERIFIED'; end if;
  for e in select value from jsonb_array_elements(p->'ticket_evidence') loop
    -- Only normalized API facts, never raw notice bodies or a guessed sale label.
    if e->>'method'='api' and e->>'sale_type'='general' and e->'event_matched'='true'::jsonb
      and coalesce(e->>'reason','')='' and private.publication_instant(e->>'opens_at')
      and private.publication_instant(e->>'verified_at')
      and coalesce(e->>'source_url','') ~ '^https://[^/@[:space:]]+([/?#]|$)'
      and not (e ? 'line' or e ? 'body' or e ? 'html' or e ? 'image') then
      if (e->>'opens_at')::timestamptz=sale and (e->>'verified_at')::timestamptz<=checked_at
        and exists(select 1 from jsonb_array_elements(p->'sources') s where s->>'url'=e->>'source_url'
          and private.publication_instant(s->>'verified_at') and (s->>'verified_at')::timestamptz<=checked_at)
        then evidence_found:=true; end if;
    end if;
  end loop;
  if not evidence_found then return 'API_SALE_EVIDENCE_REQUIRED'; end if;
  return null;
exception when data_exception then return 'INVALID_CANDIDATE_FIELDS';
end $$;

revoke all on function private.publication_day(text),private.publication_instant(text),
  private.publication_facts_reason(jsonb,text,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.service_complete_collection(run_token uuid, batch jsonb, identities jsonb, attempt_count integer, adapter_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.collection_runs; policy public.collection_policies; item jsonb; candidate public.collection_candidates;
  p jsonb; target uuid; reason text; outcome text; published integer:=0; reviews integer:=0; previous_setting text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select * into run from public.collection_runs where id=run_token;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  select * into policy from public.collection_policies where source=run.source for update;
  select * into run from public.collection_runs where id=run_token;
  -- Serialize cross-source duplicates and manual concert edits with publication.
  lock table public.concerts in share row exclusive mode;
  if run.state in ('success','partial') then return jsonb_build_object('published',run.published_count,'review',run.review_count); end if;
  if run.state <> 'running' or not exists(select 1 from private.collection_leases where run_id=run_token and expires_at>clock_timestamp()) then raise exception 'LEASE_LOST'; end if;
  if not policy.collection_enabled then raise exception 'COLLECTION_DISABLED'; end if;
  if (select count(*)<>count(distinct value->>'source_url') from jsonb_array_elements(batch->'candidates'))
    then raise exception 'DUPLICATE_BATCH_SOURCE'; end if;
  -- Existing ingestion validates source paths and resolves all identities atomically.
  perform public.admin_ingest_catalog(run.source,batch,identities);
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    select * into candidate from public.collection_candidates where source_url=item->>'source_url' for update;
    p:=candidate.payload; reason:=null; target:=null; outcome:='review';
    begin
    select concert_id into target from public.concert_sources where url=candidate.source_url limit 1;
    if candidate.automation_blocked then reason:='ADMIN_OVERRIDE';
    elsif exists(select 1 from jsonb_array_elements_text(coalesce(p->'band_ids','[]')) id join public.bands b on b.id=id::uuid where b.curation_status in ('held','excluded')) then reason:='ARTIST_CURATION_BLOCKED';
    elsif target is not null then
      if p->'cancelled' is distinct from 'false'::jsonb then reason:='CANCELLED_OR_UNKNOWN';
      elsif exists(select 1 from public.concerts c where c.id=target and (c.status<>'published' or c.cancelled)) then reason:='EXISTING_CONCERT_REVIEW';
      elsif exists(select 1 from public.collection_decisions d where d.candidate_id=candidate.id and d.outcome='published' and d.revision=candidate.revision)
        then outcome:='unchanged'; reason:='SAME_REVISION';
      else reason:='EXISTING_CONCERT_REVIEW'; end if;
    elsif not policy.publication_enabled then reason:='PUBLICATION_DISABLED';
    elsif run.source='reissue_nol' then reason:='OPTIONAL_NOL_DEPENDENCY';
    elsif service_complete_collection.adapter_version is distinct from policy.adapter_version then reason:='ADAPTER_VERSION';
    elsif private.publication_facts_reason(p,candidate.source_url,clock_timestamp()) is not null then
      reason:=private.publication_facts_reason(p,candidate.source_url,clock_timestamp());
    elsif jsonb_array_length(coalesce(p->'artist_keys','[]'))=0 or jsonb_array_length(p->'artist_keys')<>jsonb_array_length(p->'band_ids')
      or exists(select 1 from jsonb_array_elements_text(p->'artist_keys') k where not exists(select 1 from private.artist_publication_approvals a join private.artist_identities i on i.identity_key=a.identity_key join public.bands b on b.id=i.band_id
        where a.identity_key=k and b.curation_status='approved' and p->'band_ids' ? b.id::text))
      or exists(select 1 from jsonb_array_elements(coalesce(p->'discovered_artists','[]')) a where nullif(a->>'band_id','') is null) then reason:='ARTIST_OR_GENRE_UNVERIFIED';
    elsif not exists(select 1 from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url and nullif(s->>'verified_at','') is not null) then reason:='SOURCE_UNVERIFIED';
    elsif exists(select 1 from public.concerts c where
      lower(regexp_replace(c.title,'[[:space:][:punct:]]','','g'))=lower(regexp_replace(p->>'title','[[:space:][:punct:]]','','g'))
      or (c.starts_on <= coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date and coalesce(c.ends_on,c.starts_on)>=(p->>'starts_on')::date
        and exists(select 1 from public.concert_bands cb where cb.concert_id=c.id and cb.band_id in (select value::uuid from jsonb_array_elements_text(p->'band_ids'))))) then reason:='POSSIBLE_DUPLICATE_OR_CONFLICT';
    end if;
    exception when data_exception then reason:='INVALID_CANDIDATE_FIELDS'; target:=null;
    end;
    if reason is null then
      begin
        previous_setting:=current_setting('encore.initial_import',true);
        perform set_config('encore.initial_import',case when policy.live_after is null or run.started_at<=policy.live_after
          or item->'payload'->'initial_import'='true'::jsonb or (p->'ticket'->>'opens_at')::timestamptz<=clock_timestamp()
          or (p->>'announced_on')::date <= (policy.live_after at time zone 'Asia/Seoul')::date then 'true' else 'false' end,true);
        insert into public.concerts(title,format) values(p->>'title',p->>'format') returning id into target;
        insert into public.concert_sources(concert_id,url,label,verified_at)
          values(target,candidate.source_url,run.source,(select (s->>'verified_at')::timestamptz from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url limit 1));
        insert into public.concert_bands(concert_id,band_id) select distinct target,value::uuid from jsonb_array_elements_text(p->'band_ids');
        insert into public.concert_sessions(concert_id,label,starts_on,starts_at)
          select target,coalesce(nullif(btrim(s->>'label'),''),s->>'starts_on'),nullif(s->>'starts_on','')::date,nullif(s->>'starts_at','')::timestamptz from jsonb_array_elements(coalesce(p->'sessions','[]')) s;
        insert into public.ticket_schedules(concert_id,opens_at,booking_url,price_description)
          values(target,nullif(p->'ticket'->>'opens_at','')::timestamptz,nullif(p->'ticket'->>'booking_url',''),nullif(p->'ticket'->>'price_description',''));
        update public.concerts set city=nullif(p->>'city',''),venue=nullif(p->>'venue',''),starts_on=(p->>'starts_on')::date,
          ends_on=nullif(p->>'ends_on','')::date,announced_on=(p->>'announced_on')::date,announced_at=nullif(p->>'announced_at','')::timestamptz,
          announcement_verified=true,status='published' where id=target;
        insert into private.catalog_history(concert_id,after_record) values(target,private.catalog_snapshot(target));
        perform set_config('encore.initial_import',coalesce(previous_setting,''),true);
        outcome:='published'; reason:='VERIFIED_NEW_EVENT'; published:=published+1;
      exception when data_exception or check_violation or not_null_violation then
        target:=null; outcome:='review'; reason:='INVALID_PUBLICATION_FIELDS';
      end;
    end if;
    if outcome='review' then reviews:=reviews+1; end if;
    insert into public.collection_decisions(run_id,candidate_id,revision,policy_version,outcome,reason,concert_id)
      values(run_token,candidate.id,candidate.revision,policy.adapter_version,outcome,reason,target);
  end loop;
  update public.collection_runs set state=case when jsonb_array_length(batch->'failures')=0 then 'success' else 'partial' end,
    candidate_count=jsonb_array_length(batch->'candidates'),failures=batch->'failures',excluded=coalesce(batch->'excluded','[]'),
    finished_at=clock_timestamp(),attempts=least(3,greatest(1,attempt_count)),published_count=published,review_count=reviews where id=run_token;
  delete from private.collection_leases where run_id=run_token;
  return jsonb_build_object('published',published,'review',reviews);
end $$;


revoke all on function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) to service_role;
commit;

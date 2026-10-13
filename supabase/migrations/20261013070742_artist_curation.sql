-- W28: reversible artist curation, independent of external identity and country.
-- Unreviewed legacy rows remain visible until the approved-only search rollout (W31).
alter table public.bands add column curation_status text not null default 'unreviewed'
  check (curation_status in ('unreviewed','approved','held','excluded'));
alter table public.bands add column category text not null default 'unclassified'
  check (category in ('unclassified','domestic_rock','overseas_rock','jpop'));
alter table public.bands add column curation_reason text not null default '';
alter table public.bands add column curation_evidence_url text;
create index artist_management_history_band_time_idx on private.artist_management_history(band_id,changed_at desc);

-- Public clients must use version-checked, audited administrator RPCs for writes.
revoke insert, update, delete on public.bands from anon, authenticated;
drop policy bands_read on public.bands;
create policy bands_read on public.bands for select to anon, authenticated
  using (curation_status in ('unreviewed','approved'));
-- bands_admin still allows administrators to read hidden rows for editing/restoration.

create function private.audit_artist_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and to_jsonb(old)-'updated_at' = to_jsonb(new)-'updated_at' then return null; end if;
  insert into private.artist_management_history(band_id,actor_id,before_record,after_record)
    values(new.id,auth.uid(),case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,to_jsonb(new));
  if new.curation_status in ('held','excluded') then
    delete from private.artist_publication_approvals where identity_key in
      (select identity_key from private.artist_identities where band_id=new.id);
  end if;
  return null;
end $$;
revoke all on function private.audit_artist_change() from public, anon, authenticated;
create trigger audit_artist_change after insert or update on public.bands
  for each row execute function private.audit_artist_change();

-- Old approval endpoints and ingestion cannot override a curation decision.
create function private.check_artist_approval() returns trigger
language plpgsql security definer set search_path='' as $$
declare state text;
begin
  select b.curation_status into state from public.bands b join private.artist_identities i on i.band_id=b.id
    where i.identity_key=new.identity_key for update of b;
  if state in ('held','excluded') then raise exception 'ARTIST_NOT_AVAILABLE'; end if;
  return new;
end $$;
revoke all on function private.check_artist_approval() from public, anon, authenticated;
create trigger check_artist_approval before insert or update on private.artist_publication_approvals
  for each row execute function private.check_artist_approval();

create function private.curate_artist(target_band_id uuid, expected_updated_at timestamptz,
  artist_name text, country text, artist_category text, artist_aliases text[], review_status text,
  reason text, evidence_url text default null) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.bands; identity text;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  -- Same lock order as ingestion avoids row/table deadlocks during import.
  lock table public.bands in share row exclusive mode;
  select * into previous from public.bands where id=target_band_id for update;
  if not found then raise exception 'ARTIST_NOT_FOUND'; end if;
  if previous.updated_at is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if coalesce(trim(artist_name),'')='' or length(artist_name)>200 or country is null or country !~ '^[A-Z]{2}$'
    or artist_category is null or artist_category not in ('unclassified','domestic_rock','overseas_rock','jpop')
    or review_status is null or review_status not in ('unreviewed','approved','held','excluded')
    or artist_aliases is null or cardinality(artist_aliases)>100
    or exists(select 1 from unnest(artist_aliases) a where a is null or trim(a)='' or length(a)>200)
    or coalesce(trim(reason),'')='' or length(reason)>2000 then raise exception 'INVALID_ARTIST'; end if;
  if nullif(evidence_url,'') is not null and evidence_url !~ '^https://[^ /[:space:]]+(/[^[:space:]]*)?$'
    then raise exception 'INVALID_EVIDENCE'; end if;
  if review_status='approved' then
    if artist_category='unclassified' or nullif(evidence_url,'') is null then raise exception 'APPROVAL_EVIDENCE_REQUIRED'; end if;
    if not exists(select 1 from private.artist_identities where band_id=target_band_id) then raise exception 'IDENTITY_REQUIRED'; end if;
  end if;
  update public.bands set name=trim(artist_name),country_code=country,category=artist_category,
    aliases=array(select distinct trim(a) from unnest(artist_aliases) a),curation_status=review_status,
    curation_reason=trim(reason),curation_evidence_url=nullif(evidence_url,'') where id=target_band_id;
  -- An explicit fresh approval is required after restoring an excluded/held artist.
  if review_status='approved' then
    for identity in select identity_key from private.artist_identities where band_id=target_band_id loop
      perform public.admin_approve_artist(identity,evidence_url);
    end loop;
  elsif review_status='unreviewed' then
    delete from private.artist_publication_approvals where identity_key in
      (select identity_key from private.artist_identities where band_id=target_band_id);
  end if;
end $$;
revoke all on function private.curate_artist(uuid,timestamptz,text,text,text,text[],text,text,text) from public, anon, authenticated;
grant execute on function private.curate_artist(uuid,timestamptz,text,text,text,text[],text,text,text) to authenticated;
create function public.admin_curate_artist(target_band_id uuid, expected_updated_at timestamptz,
  artist_name text, country text, artist_category text, artist_aliases text[], review_status text,
  reason text, evidence_url text default null) returns void
language sql security invoker set search_path='' as $$
  select private.curate_artist(target_band_id,expected_updated_at,artist_name,country,artist_category,artist_aliases,review_status,reason,evidence_url);
$$;
revoke all on function public.admin_curate_artist(uuid,timestamptz,text,text,text,text[],text,text,text) from public, anon, authenticated;
grant execute on function public.admin_curate_artist(uuid,timestamptz,text,text,text,text[],text,text,text) to authenticated;

create function private.artist_history(target_band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at desc) from
    (select * from private.artist_management_history where band_id=target_band_id order by changed_at desc limit 50) h),'[]'::jsonb);
end $$;
revoke all on function private.artist_history(uuid) from public, anon, authenticated;
grant execute on function private.artist_history(uuid) to authenticated;
create function public.admin_artist_history(target_band_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.artist_history(target_band_id); $$;
revoke all on function public.admin_artist_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_artist_history(uuid) to authenticated;

-- Photo edits share the central audit trigger.
create or replace function public.admin_update_artist(band_id uuid, expected_updated_at timestamptz, aliases text[], photo jsonb, mode text) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.bands; field text;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into previous from public.bands where id=band_id for update;
  if not found then raise exception 'ARTIST_NOT_FOUND'; end if;
  if previous.updated_at is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if mode is null or mode not in ('auto','manual','hidden') or aliases is null or cardinality(aliases)>100
    or exists(select 1 from unnest(aliases) a where a is null or length(trim(a))=0 or length(a)>200) then raise exception 'INVALID_ARTIST'; end if;
  if mode='manual' then
    if jsonb_typeof(photo) is distinct from 'object' then raise exception 'INVALID_PHOTO'; end if;
    foreach field in array array['url','source','licenseUrl'] loop
      if coalesce(photo->>field,'') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(/[^[:space:]]*)?$'
        or coalesce(photo->>field,'') ~* '^https://(localhost[.]|[^/]*[.]local/)' then raise exception 'INVALID_PHOTO_URL'; end if;
    end loop;
    foreach field in array array['author','license','usageBasis'] loop
      if coalesce(trim(photo->>field),'')='' or length(photo->>field)>2000 then raise exception 'PHOTO_RIGHTS_REQUIRED'; end if;
    end loop;
    photo:=jsonb_build_object('url',photo->>'url','source',photo->>'source','licenseUrl',photo->>'licenseUrl',
      'author',photo->>'author','license',photo->>'license','usageBasis',photo->>'usageBasis','credit',coalesce(photo->>'credit',''),
      'retrievedAt',clock_timestamp(),'identity',coalesce(previous.musicbrainz_id::text,previous.id::text));
  else photo:=null;
  end if;
  update public.bands set aliases=array(select distinct trim(a) from unnest(admin_update_artist.aliases) a),
    representative_photo=photo,photo_mode=mode where id=band_id;
end $$;

revoke all on function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) from anon, authenticated;
revoke all on function public.admin_update_artist(uuid,timestamptz,text[],jsonb,text) from public;
grant execute on function public.admin_update_artist(uuid,timestamptz,text[],jsonb,text) to authenticated;


-- Public import cannot re-add a held/excluded artist to the client.
create or replace function public.service_import_artist(identity jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare band uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  if coalesce(identity->>'key','') !~ '^mb:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or identity->>'evidence' is distinct from 'https://musicbrainz.org/artist/' || substring(identity->>'key' from 4) then raise exception 'INVALID_IDENTITY'; end if;
  perform public.admin_ingest_catalog('artist-search','{"candidates":[],"failures":[],"excluded":[]}'::jsonb,jsonb_build_array(identity));
  select i.band_id into band from private.artist_identities i where i.identity_key = identity->>'key';
  if exists(select 1 from public.bands where id=band and curation_status in ('held','excluded')) then raise exception 'ARTIST_NOT_AVAILABLE'; end if;
  return band;
end $$;
revoke all on function public.service_import_artist(jsonb) from public;
grant execute on function public.service_import_artist(jsonb) to service_role;
revoke all on function public.service_import_artist(jsonb) from anon, authenticated;
revoke all on function public.admin_update_artist(uuid,timestamptz,text[],jsonb,text) from anon;

-- Collection retains identity matches but never publishes held/excluded artists.
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
  -- Existing ingestion validates source paths and resolves all identities atomically.
  perform public.admin_ingest_catalog(run.source,batch,identities);
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    select * into candidate from public.collection_candidates where source_url=item->>'source_url' for update;
    p:=candidate.payload; reason:=null; target:=null; outcome:='review';
    begin
    select concert_id into target from public.concert_sources where url=candidate.source_url limit 1;
    if exists(select 1 from jsonb_array_elements_text(coalesce(p->'band_ids','[]')) id join public.bands b on b.id=id::uuid where b.curation_status in ('held','excluded')) then reason:='ARTIST_CURATION_BLOCKED';
    elsif candidate.automation_blocked then reason:='ADMIN_OVERRIDE';
    elsif target is not null then
      if exists(select 1 from public.collection_decisions d where d.candidate_id=candidate.id and d.outcome='published' and d.revision=candidate.revision)
        then outcome:='unchanged'; reason:='SAME_REVISION';
      else reason:='EXISTING_CONCERT_REVIEW'; end if;
    elsif not policy.publication_enabled then reason:='PUBLICATION_DISABLED';
    elsif service_complete_collection.adapter_version is distinct from policy.adapter_version then reason:='ADAPTER_VERSION';
    elsif coalesce(p->>'country_code','') <> 'KR' then reason:='KOREA_UNVERIFIED';
    elsif coalesce(p->>'title','')='' or coalesce(p->>'format','') not in ('solo','festival') or coalesce((p->>'cancelled')::boolean,false) then reason:='INVALID_EVENT';
    elsif nullif(p->>'starts_on','') is null or (p->>'starts_on')::date > coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date
      or coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date < (clock_timestamp() at time zone 'Asia/Seoul')::date then reason:='DATE_UNVERIFIED_OR_PAST';
    elsif coalesce((p->>'announcement_verified')::boolean,false) is not true or nullif(p->>'announced_on','') is null
      or (p->>'announced_on')::date > (clock_timestamp() at time zone 'Asia/Seoul')::date then reason:='ANNOUNCEMENT_UNVERIFIED';
    elsif jsonb_array_length(coalesce(p->'review_reasons','[]'))>0 then reason:='PARSER_REVIEW_REQUIRED';
    elsif jsonb_array_length(coalesce(p->'artist_keys','[]'))=0 or jsonb_array_length(p->'artist_keys')<>jsonb_array_length(p->'band_ids')
      or exists(select 1 from jsonb_array_elements_text(p->'artist_keys') k where not exists(select 1 from private.artist_publication_approvals a where a.identity_key=k))
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
          or (p->>'announced_on')::date <= (policy.live_after at time zone 'Asia/Seoul')::date then 'true' else 'false' end,true);
        insert into public.concerts(title,format) values(p->>'title',p->>'format') returning id into target;
        insert into public.concert_sources(concert_id,url,label,verified_at)
          values(target,candidate.source_url,run.source,(select (s->>'verified_at')::timestamptz from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url limit 1));
        insert into public.concert_bands(concert_id,band_id) select distinct target,value::uuid from jsonb_array_elements_text(p->'band_ids');
        insert into public.concert_sessions(concert_id,label,starts_on,starts_at)
          select target,s->>'label',nullif(s->>'starts_on','')::date,nullif(s->>'starts_at','')::timestamptz from jsonb_array_elements(coalesce(p->'sessions','[]')) s;
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


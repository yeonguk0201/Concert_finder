-- Prepared release SQL; do not run as a collection task. Install only under a
-- reviewed release while publication is OFF and all collection leases are idle.
-- No schedule, policy activation, artist approval or notification is changed.
begin;
select source from public.collection_policies order by source for update;
do $preflight$
begin
  if exists(select 1 from public.collection_policies where publication_enabled or live_after is not null)
    then raise exception 'PUBLICATION_OFF_REQUIRED'; end if;
  if exists(select 1 from private.collection_leases where expires_at>clock_timestamp())
    then raise exception 'COLLECTION_LEASE_ACTIVE'; end if;
  if md5(pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure))
      <> 'd95b0e3e9edda18b7adc9a626589074f'
    or md5(pg_get_functiondef('private.publication_facts_reason(jsonb,text,timestamptz)'::regprocedure))
      <> 'be7d1f198a6708e10600888604881be5'
    or md5(replace(pg_get_functiondef('private.guard_publication()'::regprocedure),chr(13),''))
      <> 'f07f94cb662e61a84fad78055d112205'
    then raise exception 'PUBLICATION_CONTRACT_CHANGED_SINCE_REVIEW'; end if;
end $preflight$;

-- Durable provenance lets future edits distinguish API facts with unknown
-- optional times from reviewed legacy announcements. Existing rows stay reviewed.
alter table public.concerts add column publication_basis text not null default 'reviewed'
  check (publication_basis in ('reviewed','kopis-api-v1'));
-- Null by default: installation does not claim that source terms were reviewed.
alter table public.collection_policies add column api_facts_source_use jsonb;

create function private.kopis_api_regression(previous jsonb, incoming jsonb) returns boolean
language plpgsql stable set search_path='' as $$
begin
  if jsonb_typeof(previous) is distinct from 'object' or jsonb_typeof(incoming) is distinct from 'object' then return true; end if;
  if exists(select 1 from unnest(array['title','format','country_code','city','venue','starts_on','ends_on','cancelled']) k
    where previous->k is distinct from incoming->k) then return true; end if;
  if previous->'announcement_verified'='true'::jsonb and exists(
    select 1 from unnest(array['announced_on','announced_at','announcement_precision','announcement_verified']) k
    where previous->k is distinct from incoming->k) then return true; end if;
  if nullif(previous#>>'{ticket,opens_at}','') is not null
    and previous#>>'{ticket,opens_at}' is distinct from incoming#>>'{ticket,opens_at}' then return true; end if;
  if not (coalesce(incoming->'artist_keys','[]') @> coalesce(previous->'artist_keys','[]'))
    or not (coalesce(incoming->'band_ids','[]') @> coalesce(previous->'band_ids','[]'))
    or not (coalesce(incoming->'ticket_evidence','[]') @> coalesce(previous->'ticket_evidence','[]')) then return true; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(previous->'sessions','[]')) s where not exists(
    select 1 from jsonb_array_elements(coalesce(incoming->'sessions','[]')) n
    where n->>'starts_on'=s->>'starts_on' and (n->>'starts_at')::timestamptz=(s->>'starts_at')::timestamptz)) then return true; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(previous->'sources','[]')) s
    where nullif(s->>'verified_at','') is not null and not exists(
      select 1 from jsonb_array_elements(coalesce(incoming->'sources','[]')) n where n->>'url'=s->>'url'
      and private.publication_instant(n->>'verified_at') and (n->>'verified_at')::timestamptz >= (s->>'verified_at')::timestamptz)) then return true; end if;
  return false;
exception when data_exception then return true;
end $$;

create function private.kopis_api_sessions(guidance text, starts_on date, ends_on date) returns jsonb
language plpgsql immutable set search_path='' as $$
declare remaining text:=btrim(guidance); m text[]; selector text; time_text text; times text[];
  first_weekday integer; last_weekday integer; performance_day date; session_at timestamptz;
  sessions jsonb:='[]'; seen text[]:='{}'; matched integer;
begin
  if guidance is null or length(guidance)>4000 or starts_on is null or ends_on is null
    or ends_on<starts_on or ends_on-starts_on>365 then return null; end if;
  while remaining<>'' loop
    m:=regexp_match(remaining,'^[[:space:]]*(([월화수목금토일]요일([[:space:]]*~[[:space:]]*[월화수목금토일]요일)?)|([0-9]{4}[.-][0-9]{2}[.-][0-9]{2}))[[:space:]]*\(([0-9]{2}:[0-9]{2}([[:space:]]*,[[:space:]]*[0-9]{2}:[0-9]{2})*)\)[[:space:]]*');
    if m is null then return null; end if;
    -- m[1] is the selector; m[5] is the time list (nested groups count).
    selector:=regexp_replace(m[1],'[[:space:]]','','g');
    if selector=any(seen) then return null; end if;
    seen:=array_append(seen,selector);
    times:=regexp_split_to_array(m[5],'[[:space:]]*,[[:space:]]*');
    if cardinality(times)<>(select count(distinct v) from unnest(times) v) then return null; end if;
    remaining:=regexp_replace(remaining,'^[[:space:]]*(([월화수목금토일]요일([[:space:]]*~[[:space:]]*[월화수목금토일]요일)?)|([0-9]{4}[.-][0-9]{2}[.-][0-9]{2}))[[:space:]]*\(([0-9]{2}:[0-9]{2}([[:space:]]*,[[:space:]]*[0-9]{2}:[0-9]{2})*)\)[[:space:]]*','');
    matched:=0;
    if selector ~ '^[0-9]' then
      if not private.publication_day(replace(selector,'.','-')) then return null; end if;
      first_weekday:=null; last_weekday:=null;
    else
      first_weekday:=strpos('월화수목금토일',left(selector,1));
      last_weekday:=case when position('~' in selector)>0 then strpos('월화수목금토일',left(split_part(selector,'~',2),1)) else first_weekday end;
      if last_weekday<first_weekday then return null; end if;
    end if;
    for performance_day in select starts_on+n from generate_series(0,ends_on-starts_on) n loop
      if (first_weekday is null and performance_day=replace(selector,'.','-')::date)
        or (first_weekday is not null and extract(isodow from performance_day) between first_weekday and last_weekday) then
        matched:=matched+1;
        foreach time_text in array times loop
          if time_text !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
          session_at:=(performance_day::text||'T'||time_text||':00+09:00')::timestamptz;
          if jsonb_array_length(sessions)>=1000 or exists(select 1 from jsonb_array_elements(sessions) s
            where (s->>'starts_at')::timestamptz=session_at) then return null; end if;
          sessions:=sessions||jsonb_build_array(jsonb_build_object('starts_on',performance_day,'starts_at',session_at));
        end loop;
      end if;
    end loop;
    if matched=0 then return null; end if;
    if remaining<>'' then
      if left(remaining,1)<>',' or btrim(substring(remaining from 2))='' then return null; end if;
      remaining:=btrim(substring(remaining from 2));
    end if;
  end loop;
  if jsonb_array_length(sessions)=0 then return null; end if;
  return sessions;
exception when data_exception then return null;
end $$;

create or replace function private.kopis_api_facts_reason(p jsonb, source_url text, checked_at timestamptz) returns text
language plpgsql stable set search_path='' as $$
declare session_record jsonb; e jsonb; sale timestamptz; evidence_found boolean:=false; expected_sessions jsonb; credit jsonb; config jsonb;
begin

  if coalesce(source_url,'') !~ '^https://www[.]kopis[.]or[.]kr/por/db/pblprfr/pblprfrView[.]do[?]mt20Id=PF[0-9]{6}$'
    or p->>'kopis_id' is distinct from right(source_url,8) or p#>>'{api_observation,id}' is distinct from p->>'kopis_id'
    or p#>>'{api_observation,provider}' is distinct from 'kopis'
    or p->'initial_import' is distinct from 'true'::jsonb then return 'API_SOURCE_MISMATCH'; end if;
  if p#>>'{api_observation,state}' is null or p#>>'{api_observation,state}' not in ('공연예정','공연중')
    then return 'CANCELLED_OR_UNKNOWN'; end if;
  if not private.publication_instant(p#>>'{api_observation,observed_at}') then return 'API_OBSERVATION_REQUIRED'; end if;
  if (p#>>'{api_observation,observed_at}')::timestamptz>checked_at
    or (p#>>'{api_observation,observed_at}')::timestamptz<checked_at-interval '1 hour' then return 'API_OBSERVATION_REQUIRED'; end if;
  select api_facts_source_use into config from public.collection_policies where source='kopis';
  if config is null or jsonb_typeof(config) is distinct from 'object' or p->'source_use' is distinct from config
    or config->>'source' is distinct from 'kopis' or config->'facts_only' is distinct from 'true'::jsonb
    or coalesce(config->>'basis_url','') !~ '^https://(www[.])?kopis[.]or[.]kr([/?#]|$)'
    or not private.publication_instant(config->>'verified_at') then return 'SOURCE_USE_UNVERIFIED'; end if;
  if (config->>'verified_at')::timestamptz>checked_at then return 'SOURCE_USE_UNVERIFIED'; end if;
  if jsonb_typeof(p->'sources') is distinct from 'array' then return 'SOURCE_UNVERIFIED'; end if;
  if not exists(select 1 from jsonb_array_elements(p->'sources') s where s->>'url'=source_url
    and s->>'verified_at'=p#>>'{api_observation,observed_at}') then return 'SOURCE_UNVERIFIED'; end if;
  if p->'ticket'->'booking_url' is distinct from 'null'::jsonb or coalesce(p->'booking_links','[]')<>'[]'::jsonb
    then return 'API_BOOKING_DESTINATION_UNPERMITTED'; end if;
  if not private.publication_day(p->>'starts_on') or not private.publication_day(p->>'ends_on') then return 'DATE_UNVERIFIED_OR_PAST'; end if;
  expected_sessions:=private.kopis_api_sessions(p#>>'{api_observation,guidance}',(p->>'starts_on')::date,(p->>'ends_on')::date);
  if expected_sessions is null or jsonb_typeof(p->'sessions') is distinct from 'array' then return 'SESSIONS_UNVERIFIED'; end if;
  if jsonb_array_length(expected_sessions)<>jsonb_array_length(p->'sessions') or exists(
    select 1 from jsonb_array_elements(expected_sessions) expected_session where not exists(
      select 1 from jsonb_array_elements(p->'sessions') s where s->>'starts_on'=expected_session->>'starts_on'
        and (s->>'starts_at')::timestamptz=(expected_session->>'starts_at')::timestamptz)) then return 'SESSIONS_UNVERIFIED'; end if;
  if jsonb_typeof(p->'artist_keys') is distinct from 'array' or jsonb_typeof(p->'band_ids') is distinct from 'array'
    or jsonb_typeof(p->'discovered_artists') is distinct from 'array' then return 'ARTIST_OR_GENRE_UNVERIFIED'; end if;
  if jsonb_array_length(p->'discovered_artists')=0 or jsonb_array_length(p->'artist_keys')=0
    or jsonb_array_length(p->'band_ids')<>jsonb_array_length(p->'artist_keys')
    or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p->'artist_keys'))
    or (select count(*)<>count(distinct value) from jsonb_array_elements_text(p->'band_ids'))
    then return 'ARTIST_OR_GENRE_UNVERIFIED'; end if;
  -- Compare the entire observed credit list in both directions.
  if nullif(btrim(p#>>'{api_observation,cast}'),'') is null or exists(
    select 1 from regexp_split_to_table(p#>>'{api_observation,cast}','[,，\n]') raw
    where btrim(raw)<>'' and not exists(select 1 from jsonb_array_elements(p->'discovered_artists') a
      where btrim(normalize(raw,NFKC))=btrim(normalize(a->>'name',NFKC))))
    or exists(select 1 from jsonb_array_elements(p->'discovered_artists') a where not exists(
      select 1 from regexp_split_to_table(p#>>'{api_observation,cast}','[,，\n]') raw
      where btrim(raw)<>'' and btrim(normalize(raw,NFKC))=btrim(normalize(a->>'name',NFKC))))
    then return 'CAST_UNVERIFIED'; end if;
  for credit in select value from jsonb_array_elements(p->'discovered_artists') loop
    if coalesce(credit->>'name','')='' or length(credit->>'name')>200
      or not exists(select 1 from private.artist_publication_approvals a join private.artist_identities i using(identity_key)
        join public.bands b on b.id=i.band_id where a.identity_key=credit->>'key' and i.band_id=(credit->>'band_id')::uuid
        and b.curation_status='approved' and p->'artist_keys' ? a.identity_key and p->'band_ids' ? b.id::text)
      or (select count(*) from public.bands b where exists(select 1 from unnest(array[b.name]||b.aliases) n
        where lower(btrim(regexp_replace(normalize(n,NFKC),'[[:space:]]+',' ','g')))
          =lower(btrim(regexp_replace(normalize(credit->>'name',NFKC),'[[:space:]]+',' ','g')))))<>1
      or not exists(select 1 from public.bands b cross join unnest(array[b.name]||b.aliases) n
        where b.id=(credit->>'band_id')::uuid and lower(btrim(regexp_replace(normalize(n,NFKC),'[[:space:]]+',' ','g')))
          =lower(btrim(regexp_replace(normalize(credit->>'name',NFKC),'[[:space:]]+',' ','g'))))
      then return 'ARTIST_OR_GENRE_UNVERIFIED'; end if;
  end loop;
  if exists(select 1 from jsonb_array_elements_text(p->'artist_keys') k where not exists(
    select 1 from jsonb_array_elements(p->'discovered_artists') a where a->>'key'=k))
    or exists(select 1 from jsonb_array_elements_text(p->'band_ids') k where not exists(
      select 1 from jsonb_array_elements(p->'discovered_artists') a where a->>'band_id'=k)) then return 'CAST_UNVERIFIED'; end if;
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
  if p->'announced_on'='null'::jsonb and p->'announced_at'='null'::jsonb and p->'announcement_verified'='false'::jsonb then
    null; -- Unknown optional announcement facts stay unknown.
  else
  if p->'announcement_verified' is distinct from 'true'::jsonb
    or not private.publication_day(p->>'announced_on') then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
  if p->>'announcement_precision'='day' then
    if p->'announced_at' is distinct from 'null'::jsonb or p->'initial_import' is distinct from 'true'::jsonb
      or (p->>'announced_on')::date > (checked_at at time zone 'Asia/Seoul')::date
      then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
  else
    if not private.publication_instant(p->>'announced_at') then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
    if (p->>'announced_at')::timestamptz > checked_at
      or (p->>'announced_on')::date <> ((p->>'announced_at')::timestamptz at time zone 'Asia/Seoul')::date
      then return 'ANNOUNCEMENT_UNVERIFIED'; end if;
  end if;
  end if;
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
  if p->'ticket'->'opens_at'='null'::jsonb then
    if jsonb_array_length(p->'ticket_evidence')<>0 then return 'GENERAL_SALE_INCONSISTENT'; end if;
    return null;
  end if;
  if not private.publication_instant(p->'ticket'->>'opens_at') then return 'GENERAL_SALE_UNVERIFIED'; end if;
  sale:=(p->'ticket'->>'opens_at')::timestamptz;
  if exists(select 1 from jsonb_array_elements(p->'sessions') s where sale>(s->>'starts_at')::timestamptz)
    then return 'GENERAL_SALE_UNVERIFIED'; end if;
  for e in select value from jsonb_array_elements(p->'ticket_evidence') loop
    -- Normalized API or verified promoter-notice facts; no copied notice bodies.
    if (e->>'method'='api' or (e->>'method'='official_notice' and e->>'publisher_role'='promoter'
      and e->'source_use_verified'='true'::jsonb and coalesce(e->>'use_basis_url','') ~ '^https://[^/@[:space:]]+([/?#]|$)'))
      and e->>'sale_type'='general' and e->'event_matched'='true'::jsonb
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
  if not evidence_found then return 'VERIFIED_SALE_EVIDENCE_REQUIRED'; end if;
  return null;
exception when data_exception then return 'INVALID_CANDIDATE_FIELDS';
end $$;

create or replace function private.guard_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if old.status='published' and new.publication_basis is distinct from old.publication_basis then
      raise exception 'PUBLISHED_PROVENANCE_IMMUTABLE'; end if;
    new.first_published_at:=old.first_published_at;
    insert into private.concert_history(concert_id,actor_id,previous_record) values(old.id,auth.uid(),to_jsonb(old));
  end if;
  new.updated_at:=now();
  if new.status='published' then
    if new.starts_on is null
      or not exists(select 1 from public.concert_sources where concert_id=new.id and verified_at is not null)
      or not exists(select 1 from public.concert_bands where concert_id=new.id) then
      raise exception 'Publication requires dates, official source and lineup'; end if;
    if new.publication_basis='kopis-api-v1' then
      if new.country_code<>'KR' or nullif(btrim(new.city),'') is null or nullif(btrim(new.venue),'') is null
        or not exists(select 1 from public.concert_sources where concert_id=new.id and verified_at is not null
          and url ~ '^https://www[.]kopis[.]or[.]kr/por/db/pblprfr/pblprfrView[.]do[?]mt20Id=PF[0-9]{6}$')
        or not exists(select 1 from public.concert_sessions where concert_id=new.id)
        or exists(select 1 from public.concert_sessions where concert_id=new.id and (starts_at is null
          or starts_on is distinct from (starts_at at time zone 'Asia/Seoul')::date
          or starts_on not between new.starts_on and coalesce(new.ends_on,new.starts_on))) then
        raise exception 'API_PUBLICATION_FACTS_REQUIRED'; end if;
      if not (new.announced_on is null and new.announced_at is null and not new.announcement_verified)
        and (not new.announcement_verified or new.announced_on is null) then
        raise exception 'API_ANNOUNCEMENT_INCONSISTENT'; end if;
    elsif not new.announcement_verified or new.announced_on is null then
      raise exception 'Publication requires verified announcement';
    end if;
    new.first_published_at:=coalesce(new.first_published_at,now());
  elsif tg_op='INSERT' then new.first_published_at:=null;
  end if;
  return new;
end $$;

-- Child replacements are validated at commit, so the existing admin edit RPC
-- may replace sessions/sources atomically without leaving API provenance empty.
create function private.check_api_publication_children() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.concerts;
begin
  select * into c from public.concerts where id=old.concert_id;
  if c.status='published' and c.publication_basis='kopis-api-v1' then
    if not exists(select 1 from public.concert_sources where concert_id=c.id and verified_at is not null
      and url ~ '^https://www[.]kopis[.]or[.]kr/por/db/pblprfr/pblprfrView[.]do[?]mt20Id=PF[0-9]{6}$')
      or not exists(select 1 from public.concert_sessions where concert_id=c.id)
      or exists(select 1 from public.concert_sessions where concert_id=c.id and (starts_at is null
        or starts_on is distinct from (starts_at at time zone 'Asia/Seoul')::date
        or starts_on not between c.starts_on and coalesce(c.ends_on,c.starts_on))) then
      raise exception 'API_PUBLICATION_FACTS_REQUIRED'; end if;
  end if;
  return null;
end $$;
create constraint trigger api_sessions_publication_evidence after delete or update on public.concert_sessions
  deferrable initially deferred for each row execute function private.check_api_publication_children();
create constraint trigger api_sources_publication_evidence after delete or update on public.concert_sources
  deferrable initially deferred for each row execute function private.check_api_publication_children();

-- Patch the reviewed executor instead of replacing its source-lease, ingestion,
-- history, duplicate, manual-decision and notification implementations.
do $patch$
declare definition text; changed text; old text; replacement text;
begin
  definition:=pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure);
  old:=$old$if item ? 'reviewed_revision' or item ? 'reviewed_content_hash' then$old$;
  replacement:=$new$if batch->>'publication_contract'='kopis-api-facts-v1' then
      begin
      reason:=private.kopis_api_facts_reason(item->'payload',item->>'source_url',clock_timestamp());
      if existing_candidate.id is not null then
        if existing_candidate.automation_blocked or existing_candidate.status<>'pending' then reason:='ADMIN_OVERRIDE';
        elsif existing_candidate.revision is distinct from (item->>'api_expected_revision')::integer
          or existing_candidate.content_hash is distinct from item->>'api_expected_hash' then reason:='API_CANDIDATE_CHANGED';
        elsif private.kopis_api_regression(existing_candidate.payload,item->'payload') then reason:='REVIEWED_FACT_REGRESSION'; end if;
      elsif item ? 'api_expected_revision' or item ? 'api_expected_hash' then reason:='API_CANDIDATE_CHANGED'; end if;
      exception when data_exception then reason:='INVALID_CANDIDATE_FIELDS';
      end;
      if reason is null then retained:=retained||jsonb_build_array(item);
      else
        batch:=jsonb_set(batch,'{failures}',coalesce(batch->'failures','[]')||jsonb_build_array(
          jsonb_build_object('source_url',item->>'source_url','error',reason)));
        if existing_candidate.id is not null then
          insert into public.collection_decisions(run_id,candidate_id,revision,policy_version,outcome,reason)
            values(run_token,existing_candidate.id,existing_candidate.revision,policy.adapter_version,'review',reason);
        end if;
        reviews:=reviews+1;
      end if;
    elsif item ? 'reviewed_revision' or item ? 'reviewed_content_hash' then$new$;
  if position(old in definition)=0 then raise exception 'API_PATCH_CONTEXT_CHANGED'; end if;
  changed:=replace(definition,old,replacement);
  old:=$old$input_count:=jsonb_array_length(batch->'candidates'); retained:='[]'::jsonb;$old$;
  replacement:=$new$if batch ? 'publication_contract' then
    if batch->>'publication_contract' is distinct from 'kopis-api-facts-v1' or run.source<>'kopis'
      or policy.live_after is not null or identities is distinct from '[]'::jsonb
      then raise exception 'API_COLLECTION_SCOPE_REQUIRED'; end if;
    if batch->>'expected_executor_md5' is distinct from md5(pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure))
      or batch->>'expected_api_facts_md5' is distinct from private.kopis_api_contract_md5()
      then raise exception 'API_PUBLICATION_CONTRACT_CHANGED'; end if;
    -- Match ingestion's lock order, then prevent approvals/identities changing
    -- between validation and the final publication in this transaction.
    lock table public.bands in share row exclusive mode;
    lock table private.artist_identities,private.artist_publication_approvals in share mode;
  end if;
  input_count:=jsonb_array_length(batch->'candidates'); retained:='[]'::jsonb;$new$;
  if position(old in changed)=0 then raise exception 'API_PATCH_CONTEXT_CHANGED'; end if;
  changed:=replace(changed,old,replacement);
  old:=$old$elsif run.source='kopis' and policy.live_after is null and not (item ? 'reviewed_revision')$old$;
  replacement:=$new$elsif run.source='kopis' and policy.live_after is null and not (item ? 'reviewed_revision')
      and batch->>'publication_contract' is distinct from 'kopis-api-facts-v1'$new$;
  if position(old in changed)=0 then raise exception 'API_PATCH_CONTEXT_CHANGED'; end if;
  changed:=replace(changed,old,replacement);
  old:=$old$elsif private.publication_facts_reason(p,candidate.source_url,clock_timestamp()) is not null then
      reason:=private.publication_facts_reason(p,candidate.source_url,clock_timestamp());$old$;
  replacement:=$new$elsif batch->>'publication_contract'='kopis-api-facts-v1' and private.kopis_api_facts_reason(p,candidate.source_url,clock_timestamp()) is not null then
      reason:=private.kopis_api_facts_reason(p,candidate.source_url,clock_timestamp());
    elsif batch->>'publication_contract' is distinct from 'kopis-api-facts-v1' and private.publication_facts_reason(p,candidate.source_url,clock_timestamp()) is not null then
      reason:=private.publication_facts_reason(p,candidate.source_url,clock_timestamp());$new$;
  if position(old in changed)=0 then raise exception 'API_PATCH_CONTEXT_CHANGED'; end if;
  changed:=replace(changed,old,replacement);
  old:=$old$announcement_verified=true,status='published' where id=target;$old$;
  replacement:=$new$announcement_verified=coalesce((p->>'announcement_verified')::boolean,false),
          publication_basis=case when batch->>'publication_contract'='kopis-api-facts-v1' then 'kopis-api-v1' else 'reviewed' end,
          status='published' where id=target;$new$;
  if position(old in changed)=0 then raise exception 'API_PATCH_CONTEXT_CHANGED'; end if;
  changed:=replace(changed,old,replacement);
  execute changed;
end $patch$;

-- Pin the dependency contract as well as the executor: a changed validator or
-- final trigger must also invalidate a runner's reviewed digest.
create function private.kopis_api_contract_md5() returns text
language sql stable set search_path='' as $$
  select md5(pg_get_functiondef('private.kopis_api_facts_reason(jsonb,text,timestamptz)'::regprocedure)
    || pg_get_functiondef('private.kopis_api_regression(jsonb,jsonb)'::regprocedure)
    || pg_get_functiondef('private.guard_publication()'::regprocedure)
    || pg_get_functiondef('private.publication_day(text)'::regprocedure)
    || pg_get_functiondef('private.publication_instant(text)'::regprocedure)
    || pg_get_functiondef('private.kopis_api_sessions(text,date,date)'::regprocedure)
    || pg_get_functiondef('private.check_api_publication_children()'::regprocedure)
    || pg_get_functiondef('public.admin_ingest_catalog(text,jsonb,jsonb)'::regprocedure));
$$;

create or replace function public.service_publication_capabilities() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'SERVICE_REQUIRED'; end if;
  return jsonb_build_object('contract','publication-facts-v4','reviewed_release',true,'continuous_review',true,
    'api_facts_contract','kopis-api-facts-v1',
    'executor_md5',md5(pg_get_functiondef('public.service_complete_collection(uuid,jsonb,jsonb,integer,text)'::regprocedure)),
    'api_facts_md5',private.kopis_api_contract_md5());
end $$;

-- Read-only context. Includes held/excluded names so ambiguity cannot disappear
-- by filtering the catalog to approved artists before matching.
create function public.service_kopis_api_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'SERVICE_REQUIRED'; end if;
  return jsonb_build_object('catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'aliases',aliases,
      'country_code',country_code,'curation_status',curation_status) order by id),'[]') from public.bands),
    'approvals',(select coalesce(jsonb_agg(jsonb_build_object('identity_key',a.identity_key,'band_id',i.band_id) order by a.identity_key),'[]')
      from private.artist_publication_approvals a join private.artist_identities i using(identity_key)),
    'source_use',(select api_facts_source_use from public.collection_policies where source='kopis'));
end $$;

revoke all on function private.kopis_api_facts_reason(jsonb,text,timestamptz),private.kopis_api_regression(jsonb,jsonb),
  private.kopis_api_contract_md5(),private.kopis_api_sessions(text,date,date),private.guard_publication(),
  private.check_api_publication_children() from public,anon,authenticated,service_role;
-- Invoker capability reader requires this read-only dependency; private schema
-- remains unexposed. Nothing here grants a private writer to the service role.
grant execute on function private.kopis_api_contract_md5() to service_role;
grant usage on schema private to service_role;
revoke all on function public.service_kopis_api_context(),public.service_publication_capabilities(),
  public.service_complete_collection(uuid,jsonb,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.service_kopis_api_context(),public.service_publication_capabilities(),
  public.service_complete_collection(uuid,jsonb,jsonb,integer,text) to service_role;
commit;

-- W21: candidate ingestion and identity registration only; no automatic publication.
alter table public.collection_candidates drop constraint collection_candidates_source_url_check;
alter table public.collection_candidates add constraint collection_candidates_source_url_check check (
  source_url ~ '^https://ualive\.com/concerts/[0-9]+$'
  or source_url ~ '^https://www\.mintpaper\.co\.kr/festivals/[0-9]+$'
  or source_url ~ '^https://ticket[.]yes24[.]com/Perf/[0-9]+$'
  or source_url ~ '^https://radwimps\.jp/live/[0-9]+/$'
);
create or replace function public.admin_ingest_catalog(source text, batch jsonb, identities jsonb default '[]') returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb; identity jsonb; band uuid; matches uuid[]; ids jsonb; key text; proposed jsonb;
begin
  if not private.is_admin() and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role','') <> 'service_role' then raise exception 'ADMIN_REQUIRED'; end if;
  if source not in ('ualive','mintpaper','radwimps','yes24','artist-search') or jsonb_typeof(batch->'candidates') is distinct from 'array'
    or jsonb_array_length(batch->'candidates') > 100 or jsonb_typeof(batch->'failures') is distinct from 'array'
    or jsonb_typeof(identities) is distinct from 'array' or jsonb_array_length(identities) > 500 then raise exception 'INVALID_BATCH'; end if;
  if source = 'artist-search' and jsonb_array_length(batch->'candidates') <> 0 then raise exception 'INVALID_BATCH'; end if;
  -- Serialize first registration and cross-source aliases; preserves follows and existing IDs.
  lock table public.bands in share row exclusive mode;
  for identity in select value from jsonb_array_elements(identities) loop
    if coalesce(identity->>'key','') = '' or coalesce(identity->>'name','') = '' or coalesce(identity->>'genre','') = ''
      or coalesce(identity->>'evidence','') !~ '^https://' or coalesce(identity->>'country','') !~ '^[A-Z]{2}$'
      or jsonb_typeof(identity->'aliases') is distinct from 'array' then raise exception 'INVALID_IDENTITY'; end if;
    select i.band_id into band from private.artist_identities i where i.identity_key = identity->>'key';
    if band is not null then continue; end if;
    select array_agg(distinct b.id) into matches from public.bands b
      where b.country_code = identity->>'country' and exists (
        select 1 from unnest(array[b.name] || b.aliases) n
        cross join jsonb_array_elements_text(jsonb_build_array(identity->>'name') || (identity->'aliases')) m
        where lower(regexp_replace(n, '[[:space:]·._-]', '', 'g')) = lower(regexp_replace(m, '[[:space:]·._-]', '', 'g'))
      );
    if cardinality(matches) > 1 then continue; end if; -- ambiguous names stay unresolved
    band := matches[1];
    -- A unique same-country name is insufficient proof of identity.
    if band is not null and not exists (
      select 1 from public.bands b where b.id = band and position(identity->>'evidence' in coalesce(b.description,'')) > 0
    ) and not exists (
      select 1 from public.concert_bands cb join public.concert_sources cs on cs.concert_id = cb.concert_id
      where cb.band_id = band and cs.url = identity->>'evidence' and cs.verified_at is not null
    ) then continue; end if;
    if band is null then
      insert into public.bands(name,aliases,country_code,description)
        values(identity->>'name', array(select jsonb_array_elements_text(identity->'aliases')), identity->>'country', identity->>'genre') returning id into band;
    end if;
    insert into private.artist_identities(identity_key,band_id,genre,evidence_url) values(identity->>'key',band,identity->>'genre',identity->>'evidence');
  end loop;
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    if coalesce(item->>'content_hash','') !~ '^[a-f0-9]{64}$' or jsonb_typeof(item->'payload') is distinct from 'object'
      or not (case source when 'ualive' then coalesce(item->>'source_url','') ~ '^https://ualive\.com/concerts/[0-9]+$'
        when 'mintpaper' then coalesce(item->>'source_url','') ~ '^https://www\.mintpaper\.co\.kr/festivals/[0-9]+$'
        when 'yes24' then coalesce(item->>'source_url','') ~ '^https://ticket[.]yes24[.]com/Perf/[0-9]+$'
        when 'radwimps' then coalesce(item->>'source_url','') ~ '^https://radwimps\.jp/live/[0-9]+/$' end) then raise exception 'INVALID_CANDIDATE'; end if;
    ids := '[]';
    for key in select jsonb_array_elements_text(coalesce(item->'payload'->'artist_keys','[]')) loop
      select i.band_id into band from private.artist_identities i where i.identity_key = key;
      if band is not null then ids := ids || jsonb_build_array(band); end if;
    end loop;
    proposed := (item->'payload') || jsonb_build_object('band_ids', ids, 'status','review', 'initial_import',true);
    if jsonb_typeof(proposed->'discovered_artists') = 'array' then
      proposed := proposed || jsonb_build_object('discovered_artists', (
        select coalesce(jsonb_agg(a.value || jsonb_build_object('band_id', i.band_id) order by a.ordinality),'[]'::jsonb)
        from jsonb_array_elements(proposed->'discovered_artists') with ordinality a(value,ordinality)
        left join private.artist_identities i on i.identity_key = a.value->>'key'
      ));
    end if;
    if jsonb_array_length(ids) <> jsonb_array_length(coalesce(item->'payload'->'artist_keys','[]')) then
      proposed := proposed || jsonb_build_object('review_reasons',coalesce(proposed->'review_reasons','[]') || '["아티스트 신원 충돌/근거 미확인: 수동 검수 필요"]'::jsonb);
    end if;
    insert into public.collection_candidates(source_url,payload,content_hash) values(item->>'source_url',proposed,item->>'content_hash')
      on conflict(source_url) do update set
        previous_payload = case when collection_candidates.content_hash <> excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids' then collection_candidates.payload else collection_candidates.previous_payload end,
        payload = excluded.payload, content_hash = excluded.content_hash, fetched_at = now(),
        revision = collection_candidates.revision + case when collection_candidates.content_hash <> excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids' then 1 else 0 end,
        status = case when collection_candidates.content_hash <> excluded.content_hash or collection_candidates.payload->'band_ids' is distinct from excluded.payload->'band_ids' then 'pending' else collection_candidates.status end;
  end loop;
  if source = 'artist-search' then return; end if;
  insert into public.collection_runs(source,candidate_count,failures,excluded)
    values(source,jsonb_array_length(batch->'candidates'),batch->'failures',coalesce(batch->'excluded','[]'));
end $$;
revoke all on function public.admin_ingest_catalog(text,jsonb,jsonb) from public;
grant execute on function public.admin_ingest_catalog(text,jsonb,jsonb) to authenticated,service_role;

-- Shared across Edge instances. Search cache and request gate are server-only.
create table private.artist_search_cache (
  term text primary key check (length(term) <= 200), result jsonb not null,
  expires_at timestamptz not null
);
create table private.artist_search_gate (
  singleton boolean primary key default true check (singleton), next_at timestamptz not null
);
insert into private.artist_search_gate values (true, now());
alter table private.artist_search_cache enable row level security;
alter table private.artist_search_gate enable row level security;
create function public.service_artist_search_cache(action text, term text, value jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cached jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  if term is null or length(term) > 200 then raise exception 'INVALID_QUERY'; end if;
  if action = 'get' then
    select c.result into cached from private.artist_search_cache c where c.term = service_artist_search_cache.term and c.expires_at > now();
    return cached;
  elsif action = 'reserve' then
    update private.artist_search_gate set next_at = clock_timestamp() + interval '1100 milliseconds' where singleton and next_at <= clock_timestamp();
    return to_jsonb(found);
  elsif action = 'store' then
    if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 25 then raise exception 'INVALID_RESULT'; end if;
    delete from private.artist_search_cache where expires_at < now();
    insert into private.artist_search_cache(term,result,expires_at) values(term,value,now()+interval '7 days')
      on conflict on constraint artist_search_cache_pkey do update set result = excluded.result, expires_at = excluded.expires_at;
    return 'true'::jsonb;
  end if;
  raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.service_artist_search_cache(text,text,jsonb) from public;
grant execute on function public.service_artist_search_cache(text,text,jsonb) to service_role;

create function public.service_import_artist(identity jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare band uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  if coalesce(identity->>'key','') !~ '^mb:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or identity->>'evidence' is distinct from 'https://musicbrainz.org/artist/' || substring(identity->>'key' from 4) then raise exception 'INVALID_IDENTITY'; end if;
  perform public.admin_ingest_catalog('artist-search','{"candidates":[],"failures":[],"excluded":[]}'::jsonb,jsonb_build_array(identity));
  select i.band_id into band from private.artist_identities i where i.identity_key = identity->>'key';
  return band;
end $$;
revoke all on function public.service_import_artist(jsonb) from public;
grant execute on function public.service_import_artist(jsonb) to service_role;

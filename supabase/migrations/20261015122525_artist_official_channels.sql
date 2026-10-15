-- Official evidence is independent of expiring YouTube API metadata and photo rights.
create table private.artist_channels (
  band_id uuid primary key references public.bands(id) on delete cascade,
  musicbrainz_id uuid not null,
  website_url text,
  channel_url text not null,
  verification text not null check (verification in ('candidate','verified','needs_review')),
  evidence jsonb not null default '[]',
  locked boolean not null default false,
  previous_channel_id text,
  updated_at timestamptz not null default clock_timestamp(),
  last_status text not null default 'pending',
  last_reason text not null default '',
  last_attempt_at timestamptz
);
create table private.artist_channel_cache (
  band_id uuid primary key references private.artist_channels(band_id) on delete cascade,
  cache jsonb not null,
  checked_at timestamptz not null,
  expires_at timestamptz not null
);
create table private.artist_channel_history (
  id uuid primary key default gen_random_uuid(),
  band_id uuid not null references public.bands(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  before_record jsonb, after_record jsonb,
  changed_at timestamptz not null default clock_timestamp()
);
create unique index artist_channel_cache_unique_channel on private.artist_channel_cache ((cache->>'channelId'));
alter table private.artist_channels enable row level security;
alter table private.artist_channel_cache enable row level security;
alter table private.artist_channel_history enable row level security;
revoke all on private.artist_channels, private.artist_channel_cache, private.artist_channel_history from public, anon, authenticated, service_role;
grant usage on schema private to service_role;

create function private.channel_key(value text) returns text language sql immutable set search_path='' as $$
  select case when length(value)<=500 and value ~ '^https://(www[.]|m[.])?youtube[.]com/(channel/UC[A-Za-z0-9_-]{22}|@[^/?#[:space:]]{1,100}|user/[A-Za-z0-9._-]{1,100})/?$'
    then regexp_replace(regexp_replace(value,'^https://(www[.]|m[.])?youtube[.]com/',''),'/$','') else null end;
$$;
create function private.channel_evidence_valid(profile private.artist_channels) returns boolean
language sql stable set search_path='' as $$
  select profile.verification='verified' and exists (
    select 1 from jsonb_array_elements(profile.evidence) e
    where e->>'kind'='official_artist_page' and e->>'identityMatched'='true'
      and e->>'url' ~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(/[^[:space:]]*)?$'
      and private.channel_key(e->>'linkedChannelUrl')=private.channel_key(profile.channel_url)
      and (e->>'checkedAt')::timestamptz between now()-interval '90 days' and now()
  );
$$;
create function private.channel_profile_snapshot(profile private.artist_channels) returns jsonb
language sql immutable set search_path='' as $$
  select to_jsonb(profile)-array['last_status','last_reason','last_attempt_at'];
$$;

-- Both administrator edits and reviewed bulk manifests use this identity/version fence.
create function private.save_artist_channel(target_band_id uuid, expected_band_updated_at timestamptz,
  expected_updated_at timestamptz, profile jsonb, from_service boolean) returns void
language plpgsql security definer set search_path='' as $$
declare band public.bands; previous private.artist_channels; next private.artist_channels; item jsonb; field text;
begin
  if from_service then
    if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  elsif not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select * into band from public.bands where id=target_band_id for update;
  if not found then raise exception 'ARTIST_NOT_FOUND'; end if;
  if band.updated_at is distinct from expected_band_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  select * into previous from private.artist_channels where band_id=target_band_id for update;
  if previous.updated_at is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if from_service and previous.locked then raise exception 'CHANNEL_LOCKED'; end if;
  if band.curation_status in ('held','excluded') then raise exception 'ARTIST_NOT_AVAILABLE'; end if;
  if band.musicbrainz_id is null or profile->>'musicBrainzId' is distinct from band.musicbrainz_id::text then raise exception 'IDENTITY_REQUIRED'; end if;
  if jsonb_typeof(profile) is distinct from 'object' or private.channel_key(profile->>'channelUrl') is null
    or coalesce(profile->>'verification','') not in ('candidate','verified','needs_review')
    or jsonb_typeof(profile->'evidence') is distinct from 'array'
    or jsonb_array_length(profile->'evidence')>20 then raise exception 'INVALID_CHANNEL_PROFILE'; end if;
  if nullif(profile->>'websiteUrl','') is not null and (length(profile->>'websiteUrl')>2000
    or profile->>'websiteUrl' !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(/[^[:space:]]*)?$') then raise exception 'INVALID_EVIDENCE'; end if;
  foreach field in array array['previousChannelId'] loop
    if nullif(profile->>field,'') is not null and profile->>field !~ '^UC[A-Za-z0-9_-]{22}$' then raise exception 'INVALID_CHANNEL_PROFILE'; end if;
  end loop;
  -- Validate all evidence before the public stable function casts its timestamp.
  for item in select value from jsonb_array_elements(profile->'evidence') loop
    if jsonb_typeof(item) is distinct from 'object' or length(item::text)>6000
      or coalesce(item->>'kind','') not in ('official_artist_page','musicbrainz_relation')
      or coalesce(item->>'url','') !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*[.][A-Za-z]{2,}(/[^[:space:]]*)?$'
      or private.channel_key(item->>'linkedChannelUrl') is null
      or coalesce(item->>'checkedAt','') !~ '^\d{4}-\d{2}-\d{2}T' then raise exception 'INVALID_EVIDENCE'; end if;
    if (item->>'checkedAt')::timestamptz>now() then raise exception 'INVALID_EVIDENCE'; end if;
  end loop;
  next.band_id:=target_band_id; next.musicbrainz_id:=band.musicbrainz_id;
  next.website_url:=nullif(profile->>'websiteUrl',''); next.channel_url:=profile->>'channelUrl';
  next.verification:=profile->>'verification'; next.evidence:=profile->'evidence';
  next.locked:=coalesce((profile->>'locked')::boolean,false); next.previous_channel_id:=nullif(profile->>'previousChannelId','');
  next.updated_at:=clock_timestamp(); next.last_status:='pending'; next.last_reason:='';
  if next.verification='verified' and not private.channel_evidence_valid(next) then raise exception 'OFFICIAL_EVIDENCE_REQUIRED'; end if;
  if next.locked and (next.previous_channel_id is null or private.channel_key(next.channel_url) is distinct from 'channel/'||next.previous_channel_id) then raise exception 'LOCKED_ID_REQUIRED'; end if;
  insert into private.artist_channels select next.* on conflict (band_id) do update set
    musicbrainz_id=excluded.musicbrainz_id,website_url=excluded.website_url,channel_url=excluded.channel_url,
    verification=excluded.verification,evidence=excluded.evidence,locked=excluded.locked,previous_channel_id=excluded.previous_channel_id,
    updated_at=excluded.updated_at,last_status='pending',last_reason='',last_attempt_at=null;
  delete from private.artist_channel_cache where band_id=target_band_id;
  insert into private.artist_channel_history(band_id,actor_id,before_record,after_record)
    values(target_band_id,case when from_service then null else auth.uid() end,
      case when previous.band_id is null then null else private.channel_profile_snapshot(previous) end,private.channel_profile_snapshot(next));
  update public.catalog_signal set revision=revision+1 where id=1;
end $$;

create function public.admin_save_artist_channel(target_band_id uuid, expected_band_updated_at timestamptz,
  expected_updated_at timestamptz, profile jsonb) returns void
language sql security invoker set search_path='' as $$
  select private.save_artist_channel(target_band_id,expected_band_updated_at,expected_updated_at,profile,false);
$$;
create function public.service_save_artist_channel(target_band_id uuid, expected_band_updated_at timestamptz,
  expected_updated_at timestamptz, profile jsonb) returns void
language sql security invoker set search_path='' as $$
  select private.save_artist_channel(target_band_id,expected_band_updated_at,expected_updated_at,profile,true);
$$;

create function public.admin_artist_channel(target_band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return jsonb_build_object('profile',(select to_jsonb(p) from private.artist_channels p where band_id=target_band_id),
    'history',coalesce((select jsonb_agg(to_jsonb(h) order by changed_at desc) from
      (select * from private.artist_channel_history where band_id=target_band_id order by changed_at desc limit 20) h),'[]'::jsonb));
end $$;

create function public.service_artist_channel_manifest() returns jsonb
language plpgsql security definer set search_path='' as $$
declare artists jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  -- Runs daily; deletion happens before provider calls, including missing-key failures.
  delete from private.artist_channel_cache where expires_at<=now();
  select coalesce(jsonb_agg(jsonb_build_object(
    'bandId',b.id,'musicBrainzId',b.musicbrainz_id,'name',b.name,'curationStatus',b.curation_status,
    'identityVersion',b.updated_at,'profileVersion',p.updated_at,'channelUrl',p.channel_url,
    'verification',p.verification,'evidence',p.evidence,'previousChannelId',p.previous_channel_id,
    'locked',p.locked,'status',p.last_status,'reason',p.last_reason,'cache',c.cache
  ) order by b.name),'[]'::jsonb) into artists from private.artist_channels p join public.bands b on b.id=p.band_id
    left join private.artist_channel_cache c on c.band_id=p.band_id
    where b.musicbrainz_id=p.musicbrainz_id;
  return jsonb_build_object('version',1,'artists',artists);
end $$;

create function public.service_apply_artist_channel(result jsonb, expected_profile_updated_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare band public.bands; profile private.artist_channels; cached jsonb; stamp timestamptz; image jsonb;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select * into band from public.bands where id=(result->>'bandId')::uuid for update;
  if not found then raise exception 'ARTIST_NOT_FOUND'; end if;
  select * into profile from private.artist_channels where band_id=band.id for update;
  if profile.updated_at is distinct from expected_profile_updated_at or band.updated_at is distinct from (result->>'identityVersion')::timestamptz
    or band.musicbrainz_id::text is distinct from result->>'musicBrainzId'
    or profile.channel_url is distinct from result->>'channelUrl' then raise exception 'EDIT_CONFLICT'; end if;
  cached:=nullif(result->'cache','null'::jsonb);
  if band.curation_status in ('held','excluded') or not private.channel_evidence_valid(profile)
    or result->>'status' in ('needs_review','unavailable','candidate','skipped') then cached:=null; end if;
  if cached is not null then
    stamp:=(cached->>'checkedAt')::timestamptz;
    if stamp is null or stamp<=now()-interval '30 days' or stamp>now()+interval '1 minute'
      or coalesce(cached->>'channelId','') !~ '^UC[A-Za-z0-9_-]{22}$'
      or length(cached::text)>12000 or jsonb_typeof(cached->'thumbnails') is distinct from 'object'
      or (profile.previous_channel_id is not null and profile.previous_channel_id is distinct from cached->>'channelId')
      or (private.channel_key(profile.channel_url) like 'channel/%' and private.channel_key(profile.channel_url) is distinct from 'channel/'||(cached->>'channelId'))
      then raise exception 'INVALID_CHANNEL_CACHE'; end if;
    for image in select value from jsonb_each(cached->'thumbnails') loop
      if coalesce(image->>'url','') !~ '^https://([A-Za-z0-9_-]+[.])*(ggpht[.]com|googleusercontent[.]com|ytimg[.]com)/[^[:space:]]+$' then raise exception 'INVALID_CHANNEL_CACHE'; end if;
    end loop;
    -- A channel shared across different artists is never published automatically.
    if exists(select 1 from private.artist_channel_cache c where c.band_id<>band.id and c.cache->>'channelId'=cached->>'channelId') then
      update private.artist_channels p set last_status='needs_review',last_reason='CHANNEL_SHARED_ACROSS_IDENTITIES'
        where p.band_id=band.id or p.band_id in (select c.band_id from private.artist_channel_cache c where c.cache->>'channelId'=cached->>'channelId');
      delete from private.artist_channel_cache where band_id=band.id or cache->>'channelId'=cached->>'channelId';
      update public.catalog_signal set revision=revision+1 where id=1;
      return;
    end if;
    insert into private.artist_channel_cache values(band.id,cached,stamp,stamp+interval '30 days')
      on conflict (band_id) do update set cache=excluded.cache,checked_at=excluded.checked_at,expires_at=excluded.expires_at;
    update private.artist_channels set previous_channel_id=coalesce(previous_channel_id,cached->>'channelId') where band_id=band.id;
  else delete from private.artist_channel_cache where band_id=band.id;
  end if;
  update private.artist_channels set last_status=left(coalesce(result->>'status','failed'),40),
    last_reason=left(coalesce(result->>'reason',''),100),last_attempt_at=clock_timestamp() where band_id=band.id;
  update public.catalog_signal set revision=revision+1 where id=1;
end $$;

create function public.artist_official_profiles() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('band_id',p.band_id,'website_url',p.website_url,
    'channel_url',p.channel_url,'photo',case when c.expires_at>now() and p.last_status not in ('needs_review','unavailable') then
      jsonb_build_object('url',coalesce(c.cache#>>'{thumbnails,high,url}',c.cache#>>'{thumbnails,medium,url}',c.cache#>>'{thumbnails,default,url}'),
        'channelUrl','https://www.youtube.com/channel/'||(c.cache->>'channelId'),'checkedAt',c.checked_at,'expiresAt',c.expires_at)
      else null end)),'[]'::jsonb)
  from private.artist_channels p join public.bands b on b.id=p.band_id
    left join private.artist_channel_cache c on c.band_id=p.band_id
  where b.curation_status in ('unreviewed','approved') and b.musicbrainz_id=p.musicbrainz_id and private.channel_evidence_valid(p)
    and p.last_status not in ('needs_review','unavailable');
$$;

-- Supabase projects can have automatic grants: revoke every callable role explicitly.
revoke all on function private.channel_key(text),private.channel_evidence_valid(private.artist_channels),
  private.channel_profile_snapshot(private.artist_channels),private.save_artist_channel(uuid,timestamptz,timestamptz,jsonb,boolean)
  from public,anon,authenticated,service_role;
grant execute on function private.save_artist_channel(uuid,timestamptz,timestamptz,jsonb,boolean) to authenticated,service_role;
revoke all on function public.admin_save_artist_channel(uuid,timestamptz,timestamptz,jsonb),
  public.service_save_artist_channel(uuid,timestamptz,timestamptz,jsonb),public.admin_artist_channel(uuid),
  public.service_artist_channel_manifest(),public.service_apply_artist_channel(jsonb,timestamptz),public.artist_official_profiles()
  from public,anon,authenticated,service_role;
grant execute on function public.admin_save_artist_channel(uuid,timestamptz,timestamptz,jsonb),public.admin_artist_channel(uuid) to authenticated;
grant execute on function public.service_save_artist_channel(uuid,timestamptz,timestamptz,jsonb),public.service_artist_channel_manifest(),
  public.service_apply_artist_channel(jsonb,timestamptz) to service_role;
grant execute on function public.artist_official_profiles() to anon,authenticated;

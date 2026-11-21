-- Editorial detail only: no artist identity, curation, channel, scheduling or KOPIS writes.
create table private.artist_profile_content (
 band_id uuid primary key references public.bands(id) on delete cascade,
 musicbrainz_id uuid not null, source_version timestamptz not null,
 content jsonb not null, source_key text not null,
 updated_at timestamptz not null default clock_timestamp(), locked boolean not null default false
);
create table private.artist_profile_applications (
 source_key text primary key, band_id uuid not null references public.bands(id) on delete cascade,
 payload jsonb not null, before_record jsonb, profile_version timestamptz not null,
 applied_at timestamptz not null default clock_timestamp()
);
create index artist_profile_applications_band on private.artist_profile_applications(band_id);
alter table private.artist_profile_content enable row level security;
alter table private.artist_profile_applications enable row level security;
revoke all on private.artist_profile_content,private.artist_profile_applications from public,anon,authenticated,service_role;

create function private.profile_https(value text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(value)<=2000 and value ~ '^https://[A-Za-z0-9.-]+/[^[:space:]#]*$' and value !~ '@',false);
$$;
create function private.validate_profile_content(p jsonb, band_id uuid, mbid uuid) returns void
language plpgsql set search_path='' as $$
declare v jsonb; s jsonb; ids text[]='{}'; stamp timestamptz; cat text;
begin
 if jsonb_typeof(p) is distinct from 'object' or length(p::text)>48000
 or p::text ~ 'sb_secret_|Bearer |SUPABASE_SERVICE_ROLE_KEY|RUNNER_SECRET|YOUTUBE_API_KEY'
 or (p-array['identity','bio','wikipedia','language','bioSource','banner','channel','music','live'])<>'{}'::jsonb
 or p#>>'{identity,bandId}' is distinct from band_id::text or p#>>'{identity,musicBrainzId}' is distinct from mbid::text
 or coalesce(p#>>'{identity,wikidata}','') !~ '^https://www[.]wikidata[.]org/wiki/Q[0-9]+$'
 or coalesce(length(p->>'bio'),0) not between 10 and 5000
 or coalesce(p->>'wikipedia','') !~ '^https://[a-z-]+[.]wikipedia[.]org/wiki/[^[:space:]?#]+$'
 or coalesce(p->>'language','')='' or p#>>'{bioSource,licenseUrl}' is distinct from 'https://creativecommons.org/licenses/by-sa/4.0/'
 or coalesce(p#>>'{bioSource,revision}','') !~ '^[1-9][0-9]{0,11}$'
 or p#>>'{bioSource,revisionUrl}' is distinct from (p->>'wikipedia')||'?oldid='||(p#>>'{bioSource,revision}')
 or p#>>'{bioSource,authorsUrl}' is distinct from (p->>'wikipedia')||'?action=history'
 or coalesce(length(p#>>'{bioSource,modification}'),0)<2 then raise exception 'PROFILE_CONTENT_INVALID'; end if;
 stamp:=(p#>>'{bioSource,checkedAt}')::timestamptz;
 if stamp is null or stamp>clock_timestamp()+interval '5 minutes' or stamp<clock_timestamp()-interval '90 days' then raise exception 'PROFILE_EVIDENCE_STALE'; end if;
 if p ? 'banner' then
  s:=p->'banner';
  if jsonb_typeof(s) is distinct from 'object'
   or coalesce(s->>'url','') !~ '^https://(upload|thumb)[.]wikimedia[.]org/[^[:space:]?#]+$'
   or coalesce(s->>'source','') !~ '^https://commons[.]wikimedia[.]org/wiki/File:[^[:space:]?#]+$'
   or coalesce(length(s->>'author'),0) not between 1 and 2000
   or coalesce(length(s->>'license'),0) not between 1 and 100
   or coalesce(s->>'licenseUrl','') !~ '^https://creativecommons[.]org/licenses/by(-sa)?/(2[.]0|2[.]5|3[.]0|4[.]0)/?$'
   or s->>'useScope' is distinct from 'production_commons'
   or coalesce(s->>'restrictions','')<>'' then raise exception 'PROFILE_IMAGE_RIGHTS_REQUIRED'; end if;
 end if;
 if p ? 'channel' and coalesce(p->>'channel','')<>'' and (p->>'channel') !~ '^https://www[.]youtube[.]com/channel/UC[A-Za-z0-9_-]{22}$' then raise exception 'PROFILE_CHANNEL_INVALID'; end if;
 foreach cat in array array['music','live'] loop
  if jsonb_typeof(p->cat) is distinct from 'array' or jsonb_array_length(p->cat)>6 then raise exception 'PROFILE_VIDEO_INVALID'; end if;
  for v in select value from jsonb_array_elements(p->cat) loop
   if coalesce(v->>'id','') !~ '^[A-Za-z0-9_-]{11}$' or (v->>'id')=any(ids)
    or coalesce(v->>'channelId','') !~ '^UC[A-Za-z0-9_-]{22}$'
    or coalesce(length(v->>'title'),0) not between 1 and 500
    or coalesce(length(v->>'publisher'),0) not between 1 and 200
    or coalesce(length(v->>'officialityBasis'),0) not between 10 and 2000
    or jsonb_typeof(v->'evidenceUrls') is distinct from 'array' or jsonb_array_length(v->'evidenceUrls') not between 1 and 12
    or exists(select 1 from jsonb_array_elements_text(v->'evidenceUrls') u where not private.profile_https(u)) then raise exception 'PROFILE_VIDEO_INVALID'; end if;
   stamp:=(v->>'checkedAt')::timestamptz;
   if stamp is null or stamp>clock_timestamp()+interval '5 minutes' or stamp<clock_timestamp()-interval '7 days' then raise exception 'PROFILE_EVIDENCE_STALE'; end if;
   ids:=array_append(ids,v->>'id');
  end loop;
 end loop;
end $$;
revoke all on function private.profile_https(text),private.validate_profile_content(jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create function public.service_artist_profile_state(target_band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 return (select to_jsonb(p) from private.artist_profile_content p where p.band_id=target_band_id);
end $$;
revoke all on function public.service_artist_profile_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.service_artist_profile_state(uuid) to service_role;

create function public.service_apply_artist_profile(target_band_id uuid, expected_band_version timestamptz, expected_profile_version timestamptz, candidate_key text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.bands; p private.artist_profile_content; receipt private.artist_profile_applications; v timestamptz; before_row jsonb;
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 select * into b from public.bands where id=target_band_id for update;
 if not found or b.curation_status<>'approved' or b.musicbrainz_id is null then raise exception 'PROFILE_ARTIST_NOT_APPROVED'; end if;
 if b.updated_at is distinct from expected_band_version then raise exception 'PROFILE_EDIT_CONFLICT'; end if;
 if candidate_key is null or length(candidate_key)>240 or candidate_key !~ ('^artist-profile-preparation/v1/runs/[a-f0-9-]{36}/bands/'||b.id||'/attempts/[1-9][0-9]*[.]json[.]gz$') then raise exception 'PROFILE_SOURCE_KEY_INVALID'; end if;
 select * into p from private.artist_profile_content where band_id=b.id for update;
 if coalesce(p.locked,false) then raise exception 'PROFILE_MANUAL_LOCK'; end if;
 select * into receipt from private.artist_profile_applications where source_key=candidate_key;
 if found then
  if receipt.payload is distinct from payload or p.source_key is distinct from candidate_key or p.content is distinct from payload then raise exception 'PROFILE_ATTEMPT_CONFLICT'; end if;
  return jsonb_build_object('status','already_applied','version',p.updated_at,'sourceKey',candidate_key);
 end if;
 if p.updated_at is distinct from expected_profile_version then raise exception 'PROFILE_EDIT_CONFLICT'; end if;
 perform private.validate_profile_content(payload,b.id,b.musicbrainz_id);
 before_row:=case when p.band_id is null then null else to_jsonb(p) end;
 v:=clock_timestamp();
 insert into private.artist_profile_content(band_id,musicbrainz_id,source_version,content,source_key,updated_at)
 values(b.id,b.musicbrainz_id,b.updated_at,payload,candidate_key,v)
 on conflict(band_id) do update set musicbrainz_id=excluded.musicbrainz_id,source_version=excluded.source_version,content=excluded.content,source_key=excluded.source_key,updated_at=excluded.updated_at;
 insert into private.artist_profile_applications(source_key,band_id,payload,before_record,profile_version) values(candidate_key,b.id,payload,before_row,v);
 update public.catalog_signal set revision=revision+1 where id=1;
 return jsonb_build_object('status','applied','version',v,'sourceKey',candidate_key);
end $$;
revoke all on function public.service_apply_artist_profile(uuid,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.service_apply_artist_profile(uuid,timestamptz,timestamptz,text,jsonb) to service_role;

create function public.service_artist_profile_manifest() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' is distinct from 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('bandId',p.band_id,'musicBrainzId',p.musicbrainz_id,'sourceVersion',p.source_version,'bandVersion',b.updated_at,'curationStatus',b.curation_status,'profileVersion',p.updated_at,'sourceKey',p.source_key,'locked',p.locked,'checkedAt',p.content#>>'{bioSource,checkedAt}') order by p.updated_at,p.band_id),'[]'::jsonb) from private.artist_profile_content p join public.bands b on b.id=p.band_id);
end $$;
revoke all on function public.service_artist_profile_manifest() from public,anon,authenticated,service_role;
grant execute on function public.service_artist_profile_manifest() to service_role;

-- Approved-only projection: no private journal, receipts, versions or decisions are public.
create function public.artist_profile_content(target_band_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select (p.content || jsonb_build_object(
  'music',coalesce((select jsonb_agg(v) from jsonb_array_elements(p.content->'music') v where (v->>'checkedAt')::timestamptz>now()-interval '7 days'),'[]'::jsonb),
  'live',coalesce((select jsonb_agg(v) from jsonb_array_elements(p.content->'live') v where (v->>'checkedAt')::timestamptz>now()-interval '7 days'),'[]'::jsonb)
 )) - case when b.photo_mode in ('manual','hidden') then 'banner' else '__none__' end
 from private.artist_profile_content p join public.bands b on b.id=p.band_id
 where p.band_id=target_band_id and b.curation_status='approved' and b.musicbrainz_id=p.musicbrainz_id and b.updated_at=p.source_version;
$$;
revoke all on function public.artist_profile_content(uuid) from public,anon,authenticated,service_role;
grant execute on function public.artist_profile_content(uuid) to anon,authenticated,service_role;

create function public.admin_lock_artist_profile(target_band_id uuid, expected_profile_version timestamptz, is_locked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
 if is_locked is null then raise exception 'PROFILE_CONTENT_INVALID'; end if;
 perform 1 from public.bands where id=target_band_id for update;
 update private.artist_profile_content set locked=is_locked,updated_at=clock_timestamp() where band_id=target_band_id and updated_at=expected_profile_version;
 if not found then raise exception 'PROFILE_EDIT_CONFLICT'; end if;
end $$;
revoke all on function public.admin_lock_artist_profile(uuid,timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_lock_artist_profile(uuid,timestamptz,boolean) to authenticated;
notify pgrst,'reload schema';

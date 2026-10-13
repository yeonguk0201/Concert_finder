alter table public.bands add column musicbrainz_id uuid unique;
alter table public.bands add column representative_photo jsonb;
alter table public.bands add column photo_mode text not null default 'auto' check(photo_mode in ('auto','manual','hidden'));
alter table public.bands add column updated_at timestamptz not null default clock_timestamp();
create table private.artist_management_history (
  id uuid primary key default gen_random_uuid(), band_id uuid not null references public.bands(id),
  actor_id uuid references auth.users(id), before_record jsonb not null, after_record jsonb not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table private.artist_management_history enable row level security;
create function private.artist_version() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end $$;
create trigger artist_version before update on public.bands for each row execute function private.artist_version();

create function private.sync_musicbrainz_id() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.identity_key ~ '^mb:[a-f0-9-]{36}$' then
    update public.bands set musicbrainz_id=substring(new.identity_key from 4)::uuid
      where id=new.band_id and musicbrainz_id is null;
  end if;
  return new;
end $$;
create trigger sync_musicbrainz_id after insert on private.artist_identities for each row execute function private.sync_musicbrainz_id();
-- Only unambiguous historic IDs are exposed. Conflicting identities require review.
update public.bands b set musicbrainz_id=i.mbid from (
  select band_id,min(substring(identity_key from 4))::uuid as mbid from private.artist_identities
  where identity_key ~ '^mb:[a-f0-9-]{36}$' group by band_id having count(*)=1
) i where i.band_id=b.id;

create function public.admin_update_artist(band_id uuid, expected_updated_at timestamptz, aliases text[], photo jsonb, mode text) returns void
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
  insert into private.artist_management_history(band_id,actor_id,before_record,after_record)
    select band_id,auth.uid(),to_jsonb(previous),to_jsonb(b) from public.bands b where b.id=band_id;
end $$;
revoke all on function public.admin_update_artist(uuid,timestamptz,text[],jsonb,text) from public;
grant execute on function public.admin_update_artist(uuid,timestamptz,text[],jsonb,text) to authenticated;

create function public.service_seed_artist(identity jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare band uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  band:=public.service_import_artist(identity);
  if band is null then return null; end if;
  update public.bands b set aliases=array(select distinct a from unnest(b.aliases||array(select jsonb_array_elements_text(identity->'aliases'))) a)
    where b.id=band;
  return band;
end $$;
revoke all on function public.service_seed_artist(jsonb) from public;
grant execute on function public.service_seed_artist(jsonb) to service_role;
revoke all on function private.artist_version(), private.sync_musicbrainz_id() from public;

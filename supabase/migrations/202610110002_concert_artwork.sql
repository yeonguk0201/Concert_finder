-- Images are optional metadata. Display requires an explicit reuse-policy review.
alter table public.concerts add column artwork jsonb;
alter table public.concerts add constraint concert_artwork_safe check (artwork is null or (
  jsonb_typeof(artwork) = 'object'
  and coalesce(artwork->>'url','') ~* '^https://(resource\.ualive\.com/[^?#]+\.(jpeg|jpg|png|webp)|mintpaper\.s3\.ap-northeast-2\.amazonaws\.com/[^?#]+\.(jpeg|jpg|png|webp))$'
  and coalesce(artwork->>'source_url','') ~ '^https://(ualive\.com/concerts/[0-9]+|www\.mintpaper\.co\.kr/festivals/[0-9]+)$'
  and coalesce(artwork->>'selection_reason','') <> ''
  and jsonb_typeof(artwork->'display_approved') is not distinct from 'boolean'
));
create or replace function public.admin_save_concert(payload jsonb, expected_updated_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; previous jsonb; current_version timestamptz; item jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if payload->'artwork' is not null and payload->'artwork' <> 'null'::jsonb and not exists (
    select 1 from jsonb_array_elements(payload->'sources') s where s->>'url' = payload->'artwork'->>'source_url'
  ) then raise exception 'ARTWORK_SOURCE_REQUIRED'; end if;
  perform set_config('encore.initial_import', coalesce(payload->>'initial_import','false'), true);
  target := nullif(payload->>'id', '')::uuid;
  if target is not null then
    select updated_at into current_version from public.concerts where id = target for update;
    if not found then raise exception 'CONCERT_NOT_FOUND'; end if;
    if expected_updated_at is null or current_version is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
    previous := private.catalog_snapshot(target);
    -- Child replacements remain hidden until this transaction commits.
  else
    insert into public.concerts(title,format) values (payload->>'title', payload->>'format') returning id into target;
  end if;
  delete from public.concert_sources where concert_id = target;
  for item in select value from jsonb_array_elements(payload->'sources') loop
    insert into public.concert_sources(concert_id,url,label,verified_at)
      values(target, item->>'url', trim(item->>'label'), nullif(item->>'verified_at','')::timestamptz);
  end loop;
  delete from public.concert_bands where concert_id = target and band_id not in
    (select value::uuid from jsonb_array_elements_text(payload->'band_ids'));
  insert into public.concert_bands(concert_id,band_id)
    select target, value::uuid from jsonb_array_elements_text(payload->'band_ids')
    on conflict(concert_id,band_id) do nothing;
  delete from public.concert_sessions where concert_id = target;
  for item in select value from jsonb_array_elements(payload->'sessions') loop
    insert into public.concert_sessions(concert_id,label,starts_on,starts_at)
      values(target, item->>'label', nullif(item->>'starts_on','')::date, nullif(item->>'starts_at','')::timestamptz);
  end loop;
  insert into public.ticket_schedules(concert_id,opens_at,booking_url,price_description)
    values(target, nullif(payload->'ticket'->>'opens_at','')::timestamptz,
      nullif(payload->'ticket'->>'booking_url',''), nullif(payload->'ticket'->>'price_description',''))
    on conflict(concert_id) do update set opens_at = excluded.opens_at,
      booking_url = excluded.booking_url, price_description = excluded.price_description;
  update public.concerts set title = trim(payload->>'title'), format = payload->>'format',
    city = nullif(trim(payload->>'city'),''), venue = nullif(trim(payload->>'venue'),''),
    starts_on = nullif(payload->>'starts_on','')::date, ends_on = nullif(payload->>'ends_on','')::date,
    announced_on = nullif(payload->>'announced_on','')::date,
    announced_at = nullif(payload->>'announced_at','')::timestamptz,
    announcement_verified = coalesce((payload->>'announcement_verified')::boolean,false),
    cancelled = coalesce((payload->>'cancelled')::boolean,false), status = payload->>'status',
    artwork = case when payload ? 'artwork' then nullif(payload->'artwork','null'::jsonb) else artwork end
    where id = target;
  insert into private.catalog_history(concert_id,actor_id,before_record,after_record)
    values(target,auth.uid(),previous,private.catalog_snapshot(target));
  return target;
end;
$$;

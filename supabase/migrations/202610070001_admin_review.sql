-- Apply after 202610060001_initial.sql. No administrator is granted automatically.
create table private.catalog_history (
  id uuid primary key default gen_random_uuid(),
  concert_id uuid not null references public.concerts(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  before_record jsonb,
  after_record jsonb not null,
  changed_at timestamptz not null default clock_timestamp()
);
alter table private.catalog_history enable row level security;

create function public.is_catalog_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.is_admin();
$$;
revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;

create function private.catalog_snapshot(target uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(c) || jsonb_build_object(
    'sources', coalesce((select jsonb_agg(to_jsonb(s) order by s.url) from public.concert_sources s where s.concert_id = c.id), '[]'::jsonb),
    'band_ids', coalesce((select jsonb_agg(b.band_id order by b.band_id) from public.concert_bands b where b.concert_id = c.id), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.concert_sessions s where s.concert_id = c.id), '[]'::jsonb),
    'ticket', (select to_jsonb(t) from public.ticket_schedules t where t.concert_id = c.id)
  ) from public.concerts c where c.id = target;
$$;
revoke all on function private.catalog_snapshot(uuid) from public;

create function public.admin_catalog() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'concerts', coalesce((select jsonb_agg(private.catalog_snapshot(c.id) order by c.updated_at desc) from public.concerts c), '[]'::jsonb),
    'bands', coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from public.bands b), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.changed_at desc) from
      (select * from private.catalog_history order by changed_at desc limit 100) h), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_catalog() from public;
grant execute on function public.admin_catalog() to authenticated;

create function public.admin_save_band(band_name text, country text, aliases text[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  insert into public.bands(name, country_code, aliases) values (trim(band_name), country, coalesce(aliases, '{}')) returning id into result;
  return result;
end;
$$;
revoke all on function public.admin_save_band(text,text,text[]) from public;
grant execute on function public.admin_save_band(text,text,text[]) to authenticated;

-- One RPC is one transaction: failed publication rolls back every related edit.
create function public.admin_save_concert(payload jsonb, expected_updated_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; previous jsonb; current_version timestamptz; item jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
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
    cancelled = coalesce((payload->>'cancelled')::boolean,false), status = payload->>'status'
    where id = target;
  insert into private.catalog_history(concert_id,actor_id,before_record,after_record)
    values(target,auth.uid(),previous,private.catalog_snapshot(target));
  return target;
end;
$$;
revoke all on function public.admin_save_concert(jsonb,timestamptz) from public;
grant execute on function public.admin_save_concert(jsonb,timestamptz) to authenticated;

-- Existing guard overwrites updated_at; use clock time for optimistic concurrency.
create function private.touch_catalog_version() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
create trigger zz_touch_catalog_version before update on public.concerts
for each row execute function private.touch_catalog_version();

-- Direct child edits must not leave a published concert without its evidence.
create function private.check_published_evidence() returns trigger
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  target := old.concert_id;
  if exists(select 1 from public.concerts c where c.id = target and c.status = 'published') and
    (not exists(select 1 from public.concert_sources where concert_id = target and verified_at is not null)
      or not exists(select 1 from public.concert_bands where concert_id = target)) then
    raise exception 'Publication requires official source and lineup';
  end if;
  return null;
end;
$$;
create constraint trigger sources_publication_evidence after delete or update on public.concert_sources
deferrable initially deferred for each row execute function private.check_published_evidence();
create constraint trigger lineup_publication_evidence after delete or update on public.concert_bands
deferrable initially deferred for each row execute function private.check_published_evidence();

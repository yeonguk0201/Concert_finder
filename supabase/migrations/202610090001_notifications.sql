-- Web Push subscriptions are private; client RPCs never return encryption keys.
create table private.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
alter table private.push_devices enable row level security;
alter table private.publication_changes add column band_ids uuid[] not null default '{}';
alter table private.notification_deliveries drop constraint notification_deliveries_status_check;
alter table private.notification_deliveries add constraint notification_deliveries_status_check
  check(status in ('pending','sending','sent','failed','invalidated'));
alter table private.notification_deliveries add column lease_token uuid;
alter table private.notification_deliveries add column lease_until timestamptz;
alter table private.notification_deliveries add column sent_at timestamptz;
alter table private.notification_deliveries add column is_test boolean not null default false;
alter table private.notification_deliveries add column created_at timestamptz not null default clock_timestamp();
alter table private.notification_deliveries drop constraint notification_deliveries_check;
alter table private.notification_deliveries add constraint notification_deliveries_check check (
  (is_test and change_id is null and ticket_schedule_id is null and schedule_revision is null) or
  (not is_test and ((change_id is not null and ticket_schedule_id is null and schedule_revision is null) or
    (change_id is null and ticket_schedule_id is not null and schedule_revision is not null))));
create index delivery_due_idx on private.notification_deliveries(due_at) where status='pending';
create table private.notification_attempts (
  delivery_id uuid not null references private.notification_deliveries(id) on delete cascade,
  attempt integer not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  outcome text,
  error_code text,
  primary key(delivery_id,attempt)
);
alter table private.notification_attempts enable row level security;

create function public.notification_settings() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object(
    'preferences', coalesce((select to_jsonb(p) from public.notification_preferences p where user_id=auth.uid()),
      '{"announcements":false,"ticket_reminders":false}'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id',id,'label',label,'active',active,'updated_at',updated_at)
      order by updated_at desc) from private.push_devices where user_id=auth.uid()),'[]'::jsonb));
end $$;
revoke all on function public.notification_settings() from public;
grant execute on function public.notification_settings() to authenticated;

create function public.register_push_device(subscription jsonb, device_label text, expected_user_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; url text := subscription->>'endpoint';
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
  if auth.uid() is distinct from expected_user_id then raise exception 'ACCOUNT_CHANGED'; end if;
  -- Restrict destinations to push providers, preventing server-side arbitrary HTTP requests.
  if url is null or length(url)>2048 or url !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com)/[^[:space:]]+$'
    or coalesce(subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{87}={0,2}$'
    or coalesce(subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{22}={0,2}$'
    or length(trim(coalesce(device_label,''))) not between 1 and 80 then raise exception 'INVALID_SUBSCRIPTION'; end if;
  insert into private.push_devices(user_id,endpoint,p256dh,auth_key,label)
    values(auth.uid(),url,subscription->'keys'->>'p256dh',subscription->'keys'->>'auth',trim(device_label))
    on conflict(endpoint) do update set active=true,p256dh=excluded.p256dh,auth_key=excluded.auth_key,
      label=excluded.label,updated_at=clock_timestamp()
      where push_devices.user_id=auth.uid() returning id into result;
  -- A browser endpoint cannot silently move to another account.
  if result is null then raise exception 'DEVICE_OWNED_BY_OTHER_ACCOUNT'; end if;
  return result;
end $$;
revoke all on function public.register_push_device(jsonb,text,uuid) from public;
grant execute on function public.register_push_device(jsonb,text,uuid) to authenticated;

create function public.disable_push_device(device_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  update private.push_devices set active=false,updated_at=clock_timestamp() where id=device_id and user_id=auth.uid();
  update private.notification_deliveries set status='invalidated',last_error='DEVICE_DISABLED' where user_id=auth.uid()
    and device_key=device_id::text and status in ('pending','sending');
end $$;
revoke all on function public.disable_push_device(uuid) from public;
grant execute on function public.disable_push_device(uuid) to authenticated;

create function public.set_notification_preferences(announcements boolean, ticket_reminders boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
  insert into public.notification_preferences(user_id,announcements,ticket_reminders,updated_at)
    values(auth.uid(),announcements,ticket_reminders,clock_timestamp())
    on conflict(user_id) do update set announcements=excluded.announcements,ticket_reminders=excluded.ticket_reminders,updated_at=excluded.updated_at;
  update private.notification_deliveries n set status='invalidated',last_error='CONSENT_REVOKED' where user_id=auth.uid() and status in ('pending','sending')
    and ((not is_test and change_id is not null and not set_notification_preferences.announcements)
      or (not is_test and ticket_schedule_id is not null and not set_notification_preferences.ticket_reminders)
      or (is_test and not set_notification_preferences.announcements and not set_notification_preferences.ticket_reminders));
end $$;
revoke all on function public.set_notification_preferences(boolean,boolean) from public;
grant execute on function public.set_notification_preferences(boolean,boolean) to authenticated;

create function public.request_push_test(device_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'LOGIN_REQUIRED' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if not exists(select 1 from private.push_devices d join public.notification_preferences p on p.user_id=d.user_id
    where d.id=device_id and d.user_id=auth.uid() and d.active and (p.announcements or p.ticket_reminders)) then
    raise exception 'CONSENT_AND_DEVICE_REQUIRED'; end if;
  if exists(select 1 from private.notification_deliveries where user_id=auth.uid() and is_test and created_at>clock_timestamp()-interval '1 minute') then
    raise exception 'TEST_RATE_LIMIT'; end if;
  insert into private.notification_deliveries(user_id,device_key,due_at,is_test) values(auth.uid(),device_id::text,clock_timestamp(),true);
end $$;
revoke all on function public.request_push_test(uuid) from public;
grant execute on function public.request_push_test(uuid) to authenticated;

-- Target calculation occurs at announcement time, so later follows/consent do not backfill old news.
create function private.queue_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.initial_import or new.kind not in ('first_publication','lineup') then return null; end if;
  insert into private.notification_deliveries(user_id,change_id,device_key,due_at)
    select distinct p.user_id,new.id,d.id::text,clock_timestamp()
    from public.notification_preferences p join private.push_devices d on d.user_id=p.user_id and d.active
    join public.band_follows f on f.user_id=p.user_id and f.band_id=any(new.band_ids)
    where p.announcements on conflict do nothing;
  return null;
end $$;
create trigger queue_publication after insert on private.publication_changes for each row execute function private.queue_publication();

create function private.record_publication() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and not new.cancelled and old.first_published_at is null then
    insert into private.publication_changes(concert_id,kind,initial_import,band_ids)
      values(new.id,'first_publication',coalesce(nullif(current_setting('encore.initial_import',true),'')::boolean,false),
        array(select band_id from public.concert_bands where concert_id=new.id));
  end if;
  return null;
end $$;
create trigger record_publication after update on public.concerts for each row execute function private.record_publication();

create function private.record_lineup() returns trigger
language plpgsql security definer set search_path='' as $$
declare addition record;
begin
  -- A single admin save can add several bands: one change per concert, not one per band.
  for addition in select concert_id,array_agg(band_id) as band_ids from added_bands group by concert_id loop
    if exists(select 1 from public.concerts where id=addition.concert_id and status='published' and not cancelled) then
      insert into private.publication_changes(concert_id,kind,initial_import,band_ids)
        values(addition.concert_id,'lineup',coalesce(nullif(current_setting('encore.initial_import',true),'')::boolean,false),addition.band_ids);
    end if;
  end loop;
  return null;
end $$;
create trigger record_lineup after insert on public.concert_bands referencing new table as added_bands for each statement execute function private.record_lineup();

create function private.delivery_eligible(delivery_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.notification_deliveries n
    join private.push_devices d on d.id::text=n.device_key and d.user_id=n.user_id and d.active
    join public.notification_preferences p on p.user_id=n.user_id
    left join private.publication_changes ch on ch.id=n.change_id
    left join public.ticket_schedules t on t.id=n.ticket_schedule_id
    left join public.concerts c on c.id=coalesce(ch.concert_id,t.concert_id)
    where n.id=delivery_id and ((n.is_test and (p.announcements or p.ticket_reminders) and n.created_at>clock_timestamp()-interval '10 minutes')
      or (not n.is_test and c.status='published' and not c.cancelled
      and coalesce(c.ends_on,c.starts_on)>=(clock_timestamp() at time zone 'Asia/Seoul')::date
      and ((ch.id is not null and p.announcements and not ch.initial_import
        and ch.created_at>clock_timestamp()-interval '24 hours'
        and exists(select 1 from public.band_follows f join public.concert_bands b on b.band_id=f.band_id and b.concert_id=c.id
          where f.user_id=n.user_id and f.band_id=any(ch.band_ids)))
      or (t.id is not null and p.ticket_reminders and t.revision=n.schedule_revision and t.opens_at>clock_timestamp()
        and exists(select 1 from public.saved_schedules s where s.user_id=n.user_id and s.ticket_schedule_id=t.id))))));
$$;

create function public.claim_notification_batch() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- An interrupted send has an unknown outcome: never automatically send it again.
  update private.notification_attempts a set finished_at=clock_timestamp(),outcome='failed',error_code='UNKNOWN_OUTCOME'
    from private.notification_deliveries n where a.delivery_id=n.id and a.finished_at is null and n.status='sending' and n.lease_until<clock_timestamp();
  update private.notification_deliveries set status='failed',last_error='UNKNOWN_OUTCOME'
    where status='sending' and lease_until<clock_timestamp();
  update private.notification_deliveries n set status='invalidated',last_error='STATE_CHANGED'
    where status in ('pending','sending') and not private.delivery_eligible(n.id);
  insert into private.notification_deliveries(user_id,ticket_schedule_id,schedule_revision,device_key,due_at)
    select s.user_id,t.id,t.revision,d.id::text,greatest(t.opens_at-interval '1 hour',s.created_at,d.created_at,p.updated_at)
    from public.saved_schedules s join public.ticket_schedules t on t.id=s.ticket_schedule_id
    join public.concerts c on c.id=t.concert_id and c.status='published' and not c.cancelled
    join public.notification_preferences p on p.user_id=s.user_id and p.ticket_reminders
    join private.push_devices d on d.user_id=s.user_id and d.active
    where t.opens_at>clock_timestamp() and coalesce(c.ends_on,c.starts_on)>=(clock_timestamp() at time zone 'Asia/Seoul')::date
    on conflict(user_id,ticket_schedule_id,schedule_revision,device_key) do update
      set status='pending',due_at=excluded.due_at,last_error=null
      where notification_deliveries.status='invalidated';
  with candidates as (
    select id from private.notification_deliveries where status='pending' and due_at<=clock_timestamp() and attempts<3
    order by due_at limit 10 for update skip locked
  ), claimed as (
    update private.notification_deliveries n set status='sending',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '2 minutes'
    from candidates c where n.id=c.id returning n.id,n.lease_token
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end $$;

create function public.authorize_notification(delivery_id uuid, token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n private.notification_deliveries; result jsonb;
begin
  select * into n from private.notification_deliveries where id=delivery_id and lease_token=token
    and status='sending' and lease_until>clock_timestamp() for update;
  if not found then return null; end if;
  if not private.delivery_eligible(n.id) then
    update private.notification_deliveries set status='invalidated',last_error='STATE_CHANGED' where id=n.id; return null;
  end if;
  -- Only authorize once per lease, even if an HTTP request is accidentally repeated.
  if n.last_error='AUTHORIZED' then return null; end if;
  update private.notification_deliveries set attempts=attempts+1,last_error='AUTHORIZED' where id=n.id;
  insert into private.notification_attempts(delivery_id,attempt) values(n.id,n.attempts+1);
  if n.is_test then
    return (select jsonb_build_object('subscription',jsonb_build_object('endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key)),
      'title','encore. 테스트 알림','body','이 알림이 보이면 실제 기기 수신을 확인한 것입니다.','concertId',null,'tag',n.id,'ttl',60)
      from private.push_devices d where d.id::text=n.device_key);
  end if;
  select jsonb_build_object('subscription',jsonb_build_object('endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth_key)),
    'title',case when n.change_id is null then '예매가 곧 시작됩니다' else '찜한 밴드의 새 공연 소식' end,
    'body',c.title,'concertId',c.id,'tag',n.id,'ttl',case when n.change_id is null then
      greatest(0,least(300,extract(epoch from t.opens_at-clock_timestamp())::integer)) else 300 end)
    into result from private.push_devices d
    left join private.publication_changes ch on ch.id=n.change_id
    left join public.ticket_schedules t on t.id=n.ticket_schedule_id
    join public.concerts c on c.id=coalesce(ch.concert_id,t.concert_id)
    where d.id::text=n.device_key;
  return result;
end $$;

create function public.finish_notification(delivery_id uuid, token uuid, outcome text, error_code text default null) returns void
language plpgsql security definer set search_path='' as $$
declare n private.notification_deliveries;
begin
  if outcome not in ('sent','retry','invalid_device','failed') then raise exception 'INVALID_OUTCOME'; end if;
  select * into n from private.notification_deliveries where id=delivery_id and lease_token=token and status in ('sending','invalidated') for update;
  if not found then return; end if;
  update private.notification_attempts set finished_at=clock_timestamp(),outcome=finish_notification.outcome,error_code=left(finish_notification.error_code,80)
    where notification_attempts.delivery_id=n.id and attempt=n.attempts and finished_at is null;
  -- Preserve revocation, but still record the outcome of an already in-flight request.
  if n.status='invalidated' then return; end if;
  if outcome='invalid_device' then
    update private.push_devices set active=false,updated_at=clock_timestamp() where id::text=n.device_key;
    update private.notification_deliveries set status='invalidated',last_error='INVALID_DEVICE'
      where device_key=n.device_key and status in ('pending','sending');
  else
    update private.notification_deliveries set status=case when outcome='sent' then 'sent'
      when outcome='retry' and attempts<3 and private.delivery_eligible(n.id) then 'pending' else 'failed' end,
      sent_at=case when outcome='sent' then clock_timestamp() else null end,
      due_at=clock_timestamp()+case when attempts=1 then interval '1 minute' else interval '5 minutes' end,
      last_error=case when outcome='sent' then null else left(error_code,80) end,lease_token=null,lease_until=null where id=n.id;
  end if;
end $$;

-- No client/admin can call the worker or read the queue/subscription secrets.
revoke all on function public.claim_notification_batch() from public;
revoke all on function public.authorize_notification(uuid,uuid) from public;
revoke all on function public.finish_notification(uuid,uuid,text,text) from public;
grant execute on function public.claim_notification_batch(),public.authorize_notification(uuid,uuid),public.finish_notification(uuid,uuid,text,text) to service_role;
revoke all on function private.queue_publication(),private.record_publication(),private.record_lineup(),private.delivery_eligible(uuid) from public;

-- Explicitly suppress historical imports through the atomic admin RPC.
create or replace function public.admin_save_concert(payload jsonb, expected_updated_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; previous jsonb; current_version timestamptz; item jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
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
    cancelled = coalesce((payload->>'cancelled')::boolean,false), status = payload->>'status'
    where id = target;
  insert into private.catalog_history(concert_id,actor_id,before_record,after_record)
    values(target,auth.uid(),previous,private.catalog_snapshot(target));
  return target;
end;
$$;

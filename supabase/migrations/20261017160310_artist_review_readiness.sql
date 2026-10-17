-- A read-only poll must not claim a lease, advance a slot, acknowledge notices, or call providers.
create function private.artist_review_readiness() returns jsonb
language plpgsql stable set search_path='' as $$
declare gate private.artist_review_lock; active private.artist_review_runs;
  eligible integer; notices integer; slot bigint;
begin
  select count(*) into notices from (
    select id from private.artist_review_notices where delivered_at is null limit 30
  ) pending_notices;
  select * into gate from private.artist_review_lock where id;
  select * into active from private.artist_review_runs where id=gate.run_id;
  if active.id is not null and active.finished_at is null then
    if active.lease_until>clock_timestamp() then
      return jsonb_build_object('state','busy','reason','lease_active','eligible',0,'notices',notices);
    end if;
    return jsonb_build_object('state','ready','reason','lease_recovery','eligible',0,'notices',notices);
  end if;
  slot:=case when gate.anchor_at is null then 0 else greatest(0,floor(extract(epoch from
    (clock_timestamp()-gate.anchor_at+interval '30 minutes'))/18000)::bigint) end;
  if gate.anchor_at>clock_timestamp()+interval '30 minutes' or slot<=gate.last_slot then
    return jsonb_build_object('state','idle','reason','schedule_window','eligible',0,'notices',notices);
  end if;
  -- Keep eligibility identical to service_claim_artist_review; tests compare the two paths.
  select count(*) into eligible from (
    select b.id from public.bands b join private.artist_review_targets t on t.band_id=b.id and t.enabled
      left join private.artist_review_state s on s.band_id=b.id
    where not private.review_manual(b) and b.musicbrainz_id is not null
      and (s.band_id is null or s.snapshot<>private.review_snapshot(b) or s.policy<>'jpop-or-rock-v1+official-channels-v1+runner-v1'
        or (s.outcome='complete' and s.valid_until<=clock_timestamp())
        or (s.outcome='failed' and s.next_attempt_at<=clock_timestamp()))
    limit 10
  ) due_artists;
  return jsonb_build_object('state',case when eligible>0 then 'ready' else 'idle' end,
    'reason',case when eligible>0 then 'review_due' else 'no_work' end,'eligible',eligible,'notices',notices);
end $$;
revoke all on function private.artist_review_readiness() from public,anon,authenticated,service_role;

create function public.service_artist_review_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.review_service();
  return private.artist_review_readiness();
end $$;
revoke all on function public.service_artist_review_readiness() from public,anon,authenticated,service_role;
grant execute on function public.service_artist_review_readiness() to service_role;

-- One bounded row, not a growing log. This records polling only; it never claims a review slot.
create table private.artist_review_readiness_check (
  id boolean primary key check(id), anchor_at timestamptz, slot bigint,
  checked_at timestamptz, result jsonb
);
insert into private.artist_review_readiness_check(id) values(true);
alter table private.artist_review_readiness_check enable row level security;
revoke all on private.artist_review_readiness_check from public,anon,authenticated,service_role;

create function private.poll_artist_review_readiness() returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous private.artist_review_readiness_check; anchor timestamptz; current_slot bigint; summary jsonb;
begin
  select * into previous from private.artist_review_readiness_check where id for update;
  select coalesce(anchor_at,'epoch'::timestamptz) into anchor from private.artist_review_lock where id;
  current_slot:=floor(extract(epoch from(clock_timestamp()-anchor+interval '30 minutes'))/18000)::bigint;
  if previous.anchor_at=anchor and previous.slot>=current_slot then
    return jsonb_build_object('checked',false);
  end if;
  summary:=private.artist_review_readiness();
  update private.artist_review_readiness_check set anchor_at=anchor,slot=current_slot,
    checked_at=clock_timestamp(),result=summary where id;
  return jsonb_build_object('checked',true,'summary',summary);
end $$;
revoke all on function private.poll_artist_review_readiness() from public,anon,authenticated,service_role;

create function public.admin_artist_review_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('current',private.artist_review_readiness(),
    'lastCheckedAt',(select checked_at from private.artist_review_readiness_check where id),
    'lastScheduled',(select result from private.artist_review_readiness_check where id));
end $$;
revoke all on function public.admin_artist_review_readiness() from public,anon,authenticated,service_role;
grant execute on function public.admin_artist_review_readiness() to authenticated;

-- pg_cron is already installed on the approved production project. Local test DBs may omit it.
-- The hourly wakeup runs only SQL; the anchored slot check above limits recording to once per 5 hours.
do $$ begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('artist-review-readiness','27 * * * *','select private.poll_artist_review_readiness();');
  end if;
end $$;

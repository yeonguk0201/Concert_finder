-- Explicitly reviewed, post-publication enrichment. Does not change ingestion policy,
-- publication contracts, optional timestamps, lineage, or notification scheduling.
create function private.apply_reviewed_booking_link(proposal jsonb, expected_snapshot jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target uuid; current_record jsonb; after_record jsonb; destination text;
  checked timestamptz; receipt uuid; ticket_id uuid;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role'
    then raise exception 'SERVICE_REQUIRED' using errcode='42501'; end if;
  if proposal->'confirmed' is distinct from 'true'::jsonb
    or length(trim(coalesce(proposal->>'confirmation_basis',''))) < 10
    then raise exception 'BOOKING_CONFIRMATION_REQUIRED'; end if;
  destination := proposal->>'url';
  if destination is null or length(destination)>2048 or destination !~
    '^https://(www\.ticketlink\.co\.kr/product/[0-9]+|ticket\.yes24\.com/Perf/[0-9]+|ticket\.melon\.com/performance/index\.htm\?prodId=[0-9]+)$'
    then raise exception 'BOOKING_PRODUCT_URL_REQUIRED'; end if;
  checked := nullif(proposal->>'checked_at','')::timestamptz;
  if checked is null or checked < clock_timestamp()-interval '24 hours'
    or checked > clock_timestamp()+interval '5 minutes'
    or proposal->'evidence'->>'product_url' is distinct from destination
    or proposal->'evidence'->'identity_matched' is distinct from 'true'::jsonb
    or length(trim(coalesce(proposal->'evidence'->>'method',''))) < 10
    then raise exception 'BOOKING_EVIDENCE_REQUIRED'; end if;
  target := nullif(proposal->>'concert_id','')::uuid;
  perform 1 from public.concerts where id=target for update;
  if not found then raise exception 'CONCERT_NOT_FOUND'; end if;
  select id into ticket_id from public.ticket_schedules where concert_id=target for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;
  -- Same parent lock as the admin editor, plus the ticket row lock. Compare the
  -- complete snapshot so edits to times, lineup, sources or manual values conflict.
  current_record := private.catalog_snapshot(target);
  if expected_snapshot is null or current_record is distinct from expected_snapshot
    then raise exception 'EDIT_CONFLICT'; end if;
  if current_record->>'status'<>'published' or (current_record->>'cancelled')::boolean
    or (current_record->>'ends_on')::date < (clock_timestamp() at time zone 'Asia/Seoul')::date
    or not exists(select 1 from public.concert_sessions where concert_id=target and starts_at>clock_timestamp())
    then raise exception 'BOOKING_TARGET_INELIGIBLE'; end if;
  if current_record->'ticket'->>'booking_url'=destination
    then return jsonb_build_object('applied',false,'unchanged',true,'concert_id',target,'url',destination); end if;
  if nullif(current_record->'ticket'->>'booking_url','') is not null
    then raise exception 'BOOKING_MANUAL_VALUE_PROTECTED'; end if;
  perform set_config('encore.initial_import','true',true);
  update public.ticket_schedules set booking_url=destination where id=ticket_id;
  -- Advancing the editor version prevents an already-open form erasing this link.
  update public.concerts set updated_at=clock_timestamp() where id=target;
  after_record := private.catalog_snapshot(target);
  insert into private.catalog_history(concert_id,actor_id,before_record,after_record)
    values(target,null,current_record,after_record || jsonb_build_object('_booking_link_review',proposal))
    returning id into receipt;
  return jsonb_build_object('applied',true,'concert_id',target,'url',destination,
    'history_id',receipt,'updated_at',after_record->>'updated_at',
    'ticket_revision',after_record->'ticket'->'revision');
end $$;
revoke all on function private.apply_reviewed_booking_link(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.apply_reviewed_booking_link(jsonb,jsonb) to service_role;

create function public.service_apply_reviewed_booking_link(proposal jsonb, expected_snapshot jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.apply_reviewed_booking_link(proposal,expected_snapshot);
$$;
revoke all on function public.service_apply_reviewed_booking_link(jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.service_apply_reviewed_booking_link(jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';

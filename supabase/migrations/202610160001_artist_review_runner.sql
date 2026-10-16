-- Review before production application. No target is enabled by this migration.
-- The scoped Edge endpoint holds service credentials; clients receive only its runner secret.
create table private.artist_review_targets (
  band_id uuid primary key references public.bands(id),
  enabled boolean not null default false,
  source_hosts text[] not null check (cardinality(source_hosts) between 1 and 20)
);
create table private.artist_review_runs (
  id uuid primary key,
  started_at timestamptz not null default clock_timestamp(),
  lease_until timestamptz not null default clock_timestamp()+interval '45 minutes',
  finished_at timestamptz,
  targets uuid[] not null default '{}',
  notified boolean not null default false
);
create table private.artist_review_state (
  band_id uuid primary key references public.bands(id),
  policy text not null,
  snapshot jsonb not null,
  result jsonb not null,
  outcome text not null check (outcome in ('complete','failed','action_required')),
  checked_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null,
  next_attempt_at timestamptz not null,
  failures integer not null default 0
);
create table private.artist_review_items (
  run_id uuid not null references private.artist_review_runs(id),
  band_id uuid not null references public.bands(id),
  snapshot jsonb not null,
  channel_version timestamptz,
  checkpoint jsonb,
  primary key(run_id,band_id)
);
create table private.artist_review_notices (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.artist_review_runs(id),
  band_id uuid not null references public.bands(id),
  kind text not null check(kind in ('complete','action_required','repeated_failure')),
  delivered_at timestamptz,
  unique(run_id,band_id,kind)
);
alter table private.artist_review_notices enable row level security;
revoke all on private.artist_review_notices from public,anon,authenticated,service_role;
alter table private.artist_management_history add column review_run_id uuid references private.artist_review_runs(id);
-- Historic nullable actor IDs cannot prove a channel decision was automatic.
-- Conservatively preserve historical channel decisions, including deleted administrators.
alter table private.artist_channel_history add column manual_decision boolean not null default true;
alter table private.artist_channel_history alter column manual_decision set default false;
alter table private.artist_channel_history add column review_run_id uuid references private.artist_review_runs(id);
create function private.review_channel_origin() returns trigger language plpgsql set search_path='' as $$
begin
  new.manual_decision:=new.actor_id is not null;
  new.review_run_id:=nullif(current_setting('encore.review_run_id',true),'')::uuid;
  return new;
end $$;
revoke all on function private.review_channel_origin() from public,anon,authenticated,service_role;
create trigger review_channel_origin before insert on private.artist_channel_history
  for each row execute function private.review_channel_origin();
create table private.artist_review_lock (id boolean primary key check(id), run_id uuid references private.artist_review_runs(id));
insert into private.artist_review_lock values(true,null);
alter table private.artist_review_targets enable row level security;
alter table private.artist_review_runs enable row level security;
alter table private.artist_review_state enable row level security;
alter table private.artist_review_items enable row level security;
alter table private.artist_review_lock enable row level security;
revoke all on private.artist_review_targets,private.artist_review_runs,private.artist_review_state,
  private.artist_review_items,private.artist_review_lock from public,anon,authenticated,service_role;

create function private.review_snapshot(b public.bands) returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',b.id,'name',b.name,'aliases',b.aliases,'country',b.country_code,
    'mbid',b.musicbrainz_id,'category',b.category,'status',b.curation_status,'version',b.updated_at,
    'channelVersion',(select p.updated_at from private.artist_channels p where p.band_id=b.id),
    'sourceHosts',(select t.source_hosts from private.artist_review_targets t where t.band_id=b.id));
$$;
create function private.review_service() returns void language plpgsql stable set search_path='' as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
    then raise exception 'SERVICE_REQUIRED' using errcode='42501'; end if;
end $$;

-- Reuse the existing validation, reversible state update, approval removal and audit trigger.
-- Extract its implementation unchanged except for moving the admin gate to its wrapper.
create function private.apply_artist_curation(target_band_id uuid, expected_updated_at timestamptz,
  artist_name text, country text, artist_category text, artist_aliases text[], review_status text,
  reason text, evidence_url text default null) returns void
language plpgsql security definer set search_path='' as $$
declare previous public.bands; identity text;
begin
  -- Same lock order as ingestion avoids row/table deadlocks during import.
  lock table public.bands in share row exclusive mode;
  select * into previous from public.bands where id=target_band_id for update;
  if not found then raise exception 'ARTIST_NOT_FOUND'; end if;
  if previous.updated_at is distinct from expected_updated_at then raise exception 'EDIT_CONFLICT'; end if;
  if coalesce(trim(artist_name),'')='' or length(artist_name)>200 or country is null or country !~ '^[A-Z]{2}$'
    or artist_category is null or artist_category not in ('unclassified','domestic_rock','overseas_rock','jpop')
    or review_status is null or review_status not in ('unreviewed','approved','held','excluded')
    or artist_aliases is null or cardinality(artist_aliases)>100
    or exists(select 1 from unnest(artist_aliases) a where a is null or trim(a)='' or length(a)>200)
    or coalesce(trim(reason),'')='' or length(reason)>2000 then raise exception 'INVALID_ARTIST'; end if;
  if nullif(evidence_url,'') is not null and evidence_url !~ '^https://[^ /[:space:]]+(/[^[:space:]]*)?$'
    then raise exception 'INVALID_EVIDENCE'; end if;
  if review_status='approved' then
    if artist_category='unclassified' or nullif(evidence_url,'') is null then raise exception 'APPROVAL_EVIDENCE_REQUIRED'; end if;
    if not exists(select 1 from private.artist_identities where band_id=target_band_id) then raise exception 'IDENTITY_REQUIRED'; end if;
  end if;
  update public.bands set name=trim(artist_name),country_code=country,category=artist_category,
    aliases=array(select distinct trim(a) from unnest(artist_aliases) a),curation_status=review_status,
    curation_reason=trim(reason),curation_evidence_url=nullif(evidence_url,'') where id=target_band_id;
  -- An explicit fresh approval is required after restoring an excluded/held artist.
  if review_status='approved' then
    for identity in select identity_key from private.artist_identities where band_id=target_band_id loop
      perform public.admin_approve_artist(identity,evidence_url);
    end loop;
  elsif review_status='unreviewed' then
    delete from private.artist_publication_approvals where identity_key in
      (select identity_key from private.artist_identities where band_id=target_band_id);
  end if;
end $$;

create or replace function private.curate_artist(target_band_id uuid, expected_updated_at timestamptz,
  artist_name text, country text, artist_category text, artist_aliases text[], review_status text,
  reason text, evidence_url text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  perform private.apply_artist_curation(target_band_id,expected_updated_at,artist_name,country,
    artist_category,artist_aliases,review_status,reason,evidence_url);
end $$;

create or replace function private.audit_artist_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and to_jsonb(old)-'updated_at'=to_jsonb(new)-'updated_at' then return null; end if;
  insert into private.artist_management_history(band_id,actor_id,before_record,after_record,review_run_id)
    values(new.id,auth.uid(),case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end,to_jsonb(new),
      nullif(current_setting('encore.review_run_id',true),'')::uuid);
  if new.curation_status in ('held','excluded') then
    delete from private.artist_publication_approvals where identity_key in
      (select identity_key from private.artist_identities where band_id=new.id);
  end if;
  return null;
end $$;

create function private.review_manual(b public.bands) returns boolean language sql stable set search_path='' as $$
  select b.curation_status<>'unreviewed' or b.curation_reason<>'' or exists(
    select 1 from private.artist_management_history h where h.band_id=b.id and h.actor_id is not null
    and (h.before_record->'curation_status' is distinct from h.after_record->'curation_status'
      or h.before_record->'curation_reason' is distinct from h.after_record->'curation_reason'
      or h.before_record->'category' is distinct from h.after_record->'category'));
$$;

create function public.service_claim_artist_review(request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare active private.artist_review_runs; chosen uuid[]; result jsonb;
begin
  perform private.review_service();
  perform 1 from private.artist_review_lock where id for update;
  select r.* into active from private.artist_review_runs r join private.artist_review_lock l on l.run_id=r.id;
  if active.finished_at is null and active.lease_until>clock_timestamp() then
    if active.id<>request_id then return jsonb_build_object('state','busy','notify',false,'targets','[]'::jsonb); end if;
  else
    if exists(select 1 from private.artist_review_runs where id=request_id) then raise exception 'RUN_EXPIRED'; end if;
    -- A crashed run's unfinished targets receive a bounded delay before another investigation.
    if active.id is not null and active.finished_at is null then
      insert into private.artist_review_state(band_id,policy,snapshot,result,outcome,valid_until,next_attempt_at,failures)
        select i.band_id,'jpop-or-rock-v1+official-channels-v1+runner-v1',i.snapshot,jsonb_build_object('error','LEASE_EXPIRED'),'failed',clock_timestamp(),
          clock_timestamp()+interval '5 hours'*power(2,least(coalesce(s.failures,0),4)),coalesce(s.failures,0)+1
        from private.artist_review_items i left join private.artist_review_state s on s.band_id=i.band_id
        where i.run_id=active.id and i.checkpoint is null
        on conflict on constraint artist_review_state_pkey do update set outcome='failed',checked_at=clock_timestamp(),
          result=excluded.result,next_attempt_at=excluded.next_attempt_at,failures=excluded.failures;
      insert into private.artist_review_notices(run_id,band_id,kind)
        select active.id,i.band_id,'repeated_failure' from private.artist_review_items i
          join private.artist_review_state s on s.band_id=i.band_id
        where i.run_id=active.id and i.checkpoint is null and s.failures=3
        on conflict do nothing;
      update private.artist_review_runs set finished_at=clock_timestamp() where id=active.id;
    end if;
    -- A delayed duplicate invocation cannot start a second batch in the same five-hour period.
    if active.id is not null and active.started_at>clock_timestamp()-interval '5 hours' then
      return jsonb_build_object('state','idle','notify',false,'targets','[]'::jsonb);
    end if;
    select array_agg(id order by id) into chosen from (
      select b.id from public.bands b join private.artist_review_targets t on t.band_id=b.id and t.enabled
        left join private.artist_review_state s on s.band_id=b.id
      where not private.review_manual(b) and b.musicbrainz_id is not null
        and (s.band_id is null or s.snapshot<>private.review_snapshot(b) or s.policy<>'jpop-or-rock-v1+official-channels-v1+runner-v1'
          or (s.outcome='complete' and s.valid_until<=clock_timestamp())
          or (s.outcome='failed' and s.next_attempt_at<=clock_timestamp()))
      order by coalesce(s.next_attempt_at,'-infinity'::timestamptz),b.id limit 10
    ) candidates;
    if chosen is null then return jsonb_build_object('state','idle','notify',false,'targets','[]'::jsonb); end if;
    insert into private.artist_review_runs(id,targets) values(request_id,chosen) returning * into active;
    update private.artist_review_lock set run_id=active.id where id;
    insert into private.artist_review_items(run_id,band_id,snapshot,channel_version)
      select active.id,b.id,private.review_snapshot(b),p.updated_at from public.bands b
        left join private.artist_channels p on p.band_id=b.id where b.id=any(chosen);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('snapshot',i.snapshot,'sourceHosts',t.source_hosts,
    'channel',case when p.band_id is null then null else jsonb_build_object('url',p.channel_url,'version',p.updated_at,
      'locked',p.locked,'manual',exists(select 1 from private.artist_channel_history h where h.band_id=p.band_id and h.manual_decision),'previousChannelId',p.previous_channel_id,'verification',p.verification) end,
    'previous',s.result) order by i.band_id),'[]'::jsonb) into result
    from private.artist_review_items i join private.artist_review_targets t on t.band_id=i.band_id
      left join private.artist_channels p on p.band_id=i.band_id
      left join private.artist_review_state s on s.band_id=i.band_id
    where i.run_id=active.id and i.checkpoint is null;
  return jsonb_build_object('state','running','runId',active.id,'leaseUntil',active.lease_until,'targets',result,'notify',false);
end $$;

-- Only canonical HTTPS source URLs, no credentials, query keys, fragments or arbitrary fields.
create function private.review_evidence(proof jsonb, hosts text[]) returns boolean
language plpgsql stable set search_path='' as $$
declare item jsonb; stamp timestamptz; host text;
begin
  if jsonb_typeof(proof) is distinct from 'array' or jsonb_array_length(proof) not between 1 and 10 then return false; end if;
  for item in select value from jsonb_array_elements(proof) loop
    if coalesce(item->>'url','') !~ '^https://[A-Za-z0-9.-]+/[^?#[:space:]@]*$'
      or item->>'identityMatched' is distinct from 'true' or item->>'kind' is distinct from 'official_artist_page'
      or length(coalesce(item->>'excerpt','')) not between 10 and 1000
      or (item ? 'linkedChannelUrl' and coalesce(item->>'linkedChannelUrl','') !~ '^https://www[.]youtube[.]com/channel/UC[A-Za-z0-9_-]{22}$')
      or (item - array['url','identityMatched','kind','excerpt','checkedAt','linkedChannelUrl'])<>'{}'::jsonb then return false; end if;
    host:=lower(split_part(substring(item->>'url' from 9),'/',1));
    if not host=any(hosts) then return false; end if;
    stamp:=(item->>'checkedAt')::timestamptz;
    if stamp is null or stamp>clock_timestamp() or stamp<clock_timestamp()-interval '7 days' then return false; end if;
  end loop;
  return true;
exception when data_exception then return false;
end $$;

create function public.service_checkpoint_artist_review(run_id uuid, band_id uuid, expected_version timestamptz, result jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.artist_review_items; run private.artist_review_runs; band public.bands; target private.artist_review_targets;
  genre jsonb; channel jsonb; decision text; status text; failures integer; saved jsonb; previous text;
  profile private.artist_channels;
begin
  perform private.review_service();
  -- Use the same table-first locking order as the shared curation/ingestion path.
  lock table public.bands in share row exclusive mode;
  perform 1 from private.artist_review_lock where id for update;
  select * into run from private.artist_review_runs r where r.id=run_id for update;
  if not found or run.finished_at is not null or run.lease_until<=clock_timestamp() then raise exception 'LEASE_LOST'; end if;
  select * into job from private.artist_review_items i where i.run_id=run.id and i.band_id=service_checkpoint_artist_review.band_id for update;
  if not found then raise exception 'TARGET_NOT_CLAIMED'; end if;
  if job.checkpoint is not null then
    if job.checkpoint->'submitted' is distinct from result then raise exception 'CHECKPOINT_CONFLICT'; end if;
    return job.checkpoint-'submitted';
  end if;
  select * into band from public.bands b where b.id=job.band_id for update;
  select * into target from private.artist_review_targets t where t.band_id=job.band_id;
  if target.band_id is null or not target.enabled then raise exception 'TARGET_DISABLED'; end if;
  if band.updated_at is distinct from expected_version or private.review_snapshot(band) is distinct from job.snapshot then raise exception 'EDIT_CONFLICT'; end if;
  if private.review_manual(band) then raise exception 'MANUAL_DECISION'; end if;
  genre:=result->'genre'; channel:=result->'channel'; decision:=genre->>'decision';
  if jsonb_typeof(result) is distinct from 'object' or (result-array['genre','channel'])<>'{}'::jsonb
    or jsonb_typeof(genre) is distinct from 'object' or jsonb_typeof(channel) is distinct from 'object'
    or length(result::text)>24000 or decision is null or decision not in ('keep','exclude','hold','failed')
    or length(coalesce(genre->>'summary','')) not between 10 and 1500
    or (genre-array['decision','summary','evidence'])<>'{}'::jsonb
    or (channel-array['decision','summary','evidence','url'])<>'{}'::jsonb
    or length(coalesce(channel->>'summary','')) not between 10 and 1500
    or (decision='failed' and genre->'evidence' is distinct from '[]'::jsonb)
    or (channel->>'decision'<>'verified' and (channel->'evidence' is distinct from '[]'::jsonb or channel ? 'url'))
    or channel->>'decision' is null or channel->>'decision' not in ('verified','candidate','failed','skipped') then raise exception 'INVALID_RESULT'; end if;
  if decision<>'failed' and not private.review_evidence(genre->'evidence',target.source_hosts) then raise exception 'OFFICIAL_EVIDENCE_REQUIRED'; end if;
  if channel->>'decision'='skipped' and decision not in ('exclude','hold') then raise exception 'INVALID_RESULT'; end if;
  if channel->>'decision'='verified' then
    if decision<>'keep' or not private.review_evidence(channel->'evidence',target.source_hosts)
      or coalesce(channel->>'url','') !~ '^https://www[.]youtube[.]com/channel/UC[A-Za-z0-9_-]{22}$'
      or not exists(select 1 from jsonb_array_elements(channel->'evidence') e where e->>'linkedChannelUrl'=channel->>'url')
      then raise exception 'CHANNEL_EVIDENCE_REQUIRED'; end if;
    select p.* into profile from private.artist_channels p where p.band_id=band.id for update;
    if profile.updated_at is distinct from job.channel_version then raise exception 'EDIT_CONFLICT'; end if;
    if coalesce(profile.locked,false) or exists(select 1 from private.artist_channel_history h
      where h.band_id=band.id and h.manual_decision) then raise exception 'CHANNEL_LOCKED'; end if;
    if profile.previous_channel_id is not null and channel->>'url'<>'https://www.youtube.com/channel/'||profile.previous_channel_id
      then raise exception 'CHANNEL_ID_CHANGED'; end if;
    -- Existing RPC retains identity fencing, profile history and prior-ID protection.
    previous:=current_setting('encore.review_run_id',true);
    perform set_config('encore.review_run_id',run.id::text,true);
    perform public.service_save_artist_channel(band.id,band.updated_at,profile.updated_at,jsonb_build_object(
      'musicBrainzId',band.musicbrainz_id,'websiteUrl',channel->'evidence'->0->>'url',
      'channelUrl',channel->>'url','verification','verified','evidence',channel->'evidence','previousChannelId',profile.previous_channel_id,'locked',false));
    perform set_config('encore.review_run_id',coalesce(previous,''),true);
  end if;
  if decision in ('exclude','hold') then
    previous:=current_setting('encore.review_run_id',true);
    perform set_config('encore.review_run_id',run.id::text,true);
    perform private.apply_artist_curation(band.id,band.updated_at,band.name,band.country_code,band.category,band.aliases,
      case decision when 'exclude' then 'excluded' else 'held' end,
      '자동 검수 jpop-or-rock-v1: '||(genre->>'summary'),genre->'evidence'->0->>'url');
    perform set_config('encore.review_run_id',coalesce(previous,''),true);
    select * into band from public.bands b where b.id=job.band_id;
  end if;
  status:=case when decision='failed' or channel->>'decision'='failed' then 'failed'
    when decision='hold' or channel->>'decision'='candidate' then 'action_required' else 'complete' end;
  select coalesce(s.failures,0) into failures from private.artist_review_state s where s.band_id=job.band_id;
  failures:=case when status='failed' then coalesce(failures,0)+1 else 0 end;
  insert into private.artist_review_state(band_id,policy,snapshot,result,outcome,valid_until,next_attempt_at,failures)
    values(band.id,'jpop-or-rock-v1+official-channels-v1+runner-v1',private.review_snapshot(band),result,status,
      clock_timestamp()+interval '90 days',clock_timestamp()+interval '5 hours'*power(2,least(greatest(failures-1,0),4)),failures)
    on conflict on constraint artist_review_state_pkey do update set policy=excluded.policy,snapshot=excluded.snapshot,result=excluded.result,
      outcome=excluded.outcome,checked_at=clock_timestamp(),valid_until=excluded.valid_until,next_attempt_at=excluded.next_attempt_at,failures=excluded.failures;
  saved:=jsonb_build_object('outcome',status,'failures',failures,'notify',status in ('complete','action_required') or failures=3);
  if (saved->>'notify')::boolean then
    insert into private.artist_review_notices(run_id,band_id,kind) values(run.id,band.id,
      case when status='failed' then 'repeated_failure' else status end) on conflict do nothing;
  end if;
  update private.artist_review_items i set checkpoint=saved||jsonb_build_object('submitted',result)
    where i.run_id=run.id and i.band_id=job.band_id;
  return saved;
end $$;

create function public.service_finish_artist_review(run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run private.artist_review_runs; summary jsonb; remaining integer;
begin
  perform private.review_service();
  perform 1 from private.artist_review_lock where id for update;
  select * into run from private.artist_review_runs r where r.id=run_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if run.notified then return jsonb_build_object('notify',false,'state','finished'); end if;
  if run.lease_until<=clock_timestamp() and run.finished_at is null then raise exception 'LEASE_LOST'; end if;
  select count(*) into remaining from private.artist_review_items i where i.run_id=run.id and checkpoint is null;
  if remaining>0 then return jsonb_build_object('notify',false,'state','incomplete','remaining',remaining); end if;
  select jsonb_build_object('state','finished','notify',coalesce(bool_or((checkpoint->>'notify')::boolean),false),
    'complete',count(*) filter(where checkpoint->>'outcome'='complete'),
    'failed',count(*) filter(where checkpoint->>'outcome'='failed'),
    'actionRequired',count(*) filter(where checkpoint->>'outcome'='action_required')) into summary
    from private.artist_review_items i where i.run_id=run.id;
  update private.artist_review_runs set finished_at=clock_timestamp(),notified=true where id=run.id;
  return summary;
end $$;

-- Revoke default EXECUTE explicitly, including service_role on internal helpers/core.
revoke all on function private.apply_artist_curation(uuid,timestamptz,text,text,text,text[],text,text,text),
  private.review_snapshot(public.bands),private.review_service(),private.review_manual(public.bands),private.review_evidence(jsonb,text[])
  from public,anon,authenticated,service_role;
revoke all on function public.service_claim_artist_review(uuid),
  public.service_checkpoint_artist_review(uuid,uuid,timestamptz,jsonb),public.service_finish_artist_review(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.service_claim_artist_review(uuid),
  public.service_checkpoint_artist_review(uuid,uuid,timestamptz,jsonb),public.service_finish_artist_review(uuid) to service_role;

create function public.service_artist_review_context(run_id uuid, band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
  perform private.review_service();
  select jsonb_build_object('snapshot',i.snapshot,'sourceHosts',t.source_hosts,'checkpoint',i.checkpoint) into context
    from private.artist_review_items i join private.artist_review_runs r on r.id=i.run_id
      join private.artist_review_targets t on t.band_id=i.band_id and t.enabled
    where i.run_id=service_artist_review_context.run_id and i.band_id=service_artist_review_context.band_id
      and r.finished_at is null and r.lease_until>clock_timestamp();
  if context is null then raise exception 'LEASE_LOST'; end if;
  return context;
end $$;
revoke all on function public.service_artist_review_context(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.service_artist_review_context(uuid,uuid) to service_role;

-- Persist investigation failures/conflicts without touching a catalog row.
create function public.service_defer_artist_review(run_id uuid, band_id uuid, reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.artist_review_items; band public.bands; n integer; outcome text; saved jsonb; submitted jsonb;
begin
  perform private.review_service();
  perform 1 from private.artist_review_lock where id for update;
  if reason not in ('SOURCE_UNAVAILABLE','INVESTIGATION_FAILED','EDIT_CONFLICT','CHANNEL_LOCKED',
    'CHANNEL_ID_CHANGED','YOUTUBE_ACTION_REQUIRED','CONFIGURATION_REQUIRED') or reason is null then raise exception 'INVALID_RESULT'; end if;
  if not exists(select 1 from private.artist_review_runs r where r.id=run_id and r.finished_at is null
    and r.lease_until>clock_timestamp()) then raise exception 'LEASE_LOST'; end if;
  select * into job from private.artist_review_items i where i.run_id=service_defer_artist_review.run_id
    and i.band_id=service_defer_artist_review.band_id for update;
  if not found then raise exception 'TARGET_NOT_CLAIMED'; end if;
  submitted:=jsonb_build_object('error',reason);
  if job.checkpoint is not null then
    if job.checkpoint->'submitted'<>submitted then raise exception 'CHECKPOINT_CONFLICT'; end if;
    return job.checkpoint-'submitted';
  end if;
  select * into band from public.bands b where b.id=job.band_id;
  outcome:=case when reason in ('SOURCE_UNAVAILABLE','INVESTIGATION_FAILED') then 'failed' else 'action_required' end;
  select coalesce(s.failures,0) into n from private.artist_review_state s where s.band_id=job.band_id;
  n:=case when outcome='failed' then coalesce(n,0)+1 else 0 end;
  insert into private.artist_review_state(band_id,policy,snapshot,result,outcome,valid_until,next_attempt_at,failures)
    values(band.id,'jpop-or-rock-v1+official-channels-v1+runner-v1',private.review_snapshot(band),submitted,outcome,clock_timestamp(),
      clock_timestamp()+interval '5 hours'*power(2,least(greatest(n-1,0),4)),n)
    on conflict on constraint artist_review_state_pkey do update set snapshot=excluded.snapshot,result=excluded.result,outcome=excluded.outcome,
      checked_at=clock_timestamp(),valid_until=excluded.valid_until,next_attempt_at=excluded.next_attempt_at,failures=excluded.failures;
  saved:=jsonb_build_object('outcome',outcome,'failures',n,'notify',outcome='action_required' or n=3);
  if (saved->>'notify')::boolean then
    insert into private.artist_review_notices(run_id,band_id,kind) values(job.run_id,job.band_id,
      case when outcome='failed' then 'repeated_failure' else outcome end) on conflict do nothing;
  end if;
  update private.artist_review_items i set checkpoint=saved||jsonb_build_object('submitted',submitted)
    where i.run_id=job.run_id and i.band_id=job.band_id;
  return saved;
end $$;
revoke all on function public.service_defer_artist_review(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.service_defer_artist_review(uuid,uuid,text) to service_role;

-- Durable outbox: listing never consumes. Acknowledge only prepared user notifications.
create function public.service_artist_review_notices(acknowledge uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.review_service();
  if acknowledge is null or cardinality(acknowledge)>30 then raise exception 'INVALID_RESULT'; end if;
  update private.artist_review_notices set delivered_at=clock_timestamp()
    where id=any(acknowledge) and delivered_at is null;
  select coalesce(jsonb_agg(to_jsonb(n)),'[]'::jsonb) into result from (
    select id,run_id,band_id,kind from private.artist_review_notices
      where delivered_at is null order by id limit 30
  ) n;
  return result;
end $$;
revoke all on function public.service_artist_review_notices(uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.service_artist_review_notices(uuid[]) to service_role;

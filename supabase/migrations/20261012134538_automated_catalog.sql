-- Server-owned leases and publication decisions. New policies start disabled.
create table public.collection_policies (
  source text primary key check (source in ('ualive','mintpaper','radwimps','yes24')),
  collection_enabled boolean not null default true,
  publication_enabled boolean not null default false,
  adapter_version text not null default 'catalog-v1',
  live_after timestamptz, -- administrator ends initial backfill explicitly
  updated_at timestamptz not null default clock_timestamp()
);
insert into public.collection_policies(source) values ('ualive'),('mintpaper'),('radwimps'),('yes24');
alter table public.collection_policies enable row level security;
grant select on public.collection_policies to authenticated;
create policy admin_policy_read on public.collection_policies for select to authenticated using (private.is_admin());

alter table public.collection_runs add column scheduled_at timestamptz;
alter table public.collection_runs add column started_at timestamptz;
alter table public.collection_runs add column finished_at timestamptz;
alter table public.collection_runs add column state text not null default 'legacy'
  check (state in ('legacy','running','success','partial','failed','expired'));
alter table public.collection_runs add column attempts integer not null default 0;
alter table public.collection_runs add column published_count integer not null default 0;
alter table public.collection_runs add column review_count integer not null default 0;
create index collection_runs_source_time on public.collection_runs(source,created_at desc);
create table private.collection_leases (
  source text primary key references public.collection_policies(source),
  run_id uuid not null references public.collection_runs(id), expires_at timestamptz not null
);
alter table private.collection_leases enable row level security;

-- External identity alone is not a genre or performance verification.
create table private.artist_publication_approvals (
  identity_key text primary key references private.artist_identities(identity_key),
  evidence_url text not null check (evidence_url ~ '^https://[^ /]+'),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default clock_timestamp()
);
alter table private.artist_publication_approvals enable row level security;
alter table public.collection_candidates add column automation_blocked boolean not null default false;
create table public.collection_decisions (
  id uuid primary key default gen_random_uuid(), run_id uuid not null references public.collection_runs(id),
  candidate_id uuid not null references public.collection_candidates(id), revision integer not null,
  policy_version text not null, outcome text not null check (outcome in ('published','review','unchanged')),
  reason text not null, concert_id uuid references public.concerts(id), decided_at timestamptz not null default clock_timestamp(),
  unique(run_id,candidate_id)
);
alter table public.collection_decisions enable row level security;
grant select on public.collection_decisions to authenticated;
create policy admin_decision_read on public.collection_decisions for select to authenticated using (private.is_admin());

create function public.admin_collection_policy(source_name text, collect_enabled boolean, publish_enabled boolean, end_backfill boolean default false) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.collection_policies set collection_enabled=collect_enabled, publication_enabled=publish_enabled,
    live_after=case when end_backfill then coalesce(live_after,clock_timestamp()) else live_after end, updated_at=clock_timestamp()
    where source=source_name;
  if not found then raise exception 'UNKNOWN_SOURCE'; end if;
end $$;
create function public.admin_approve_artist(identity_key text, evidence_url text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by)
    values(identity_key,evidence_url,auth.uid()) on conflict on constraint artist_publication_approvals_pkey
    do update set evidence_url=excluded.evidence_url,approved_by=excluded.approved_by,approved_at=clock_timestamp();
end $$;
create function public.admin_candidate_automation(candidate_id uuid, blocked boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  update public.collection_candidates set automation_blocked=blocked where id=candidate_id;
  if not found then raise exception 'CANDIDATE_NOT_FOUND'; end if;
end $$;
-- Marking reviewed/dismissed remains sticky even when ingestion changes its status.
create function private.block_resolved_automation() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.status in ('reviewed','dismissed') and new.status is distinct from old.status then new.automation_blocked:=true; end if;
  return new;
end $$;
create trigger block_resolved_automation before update on public.collection_candidates
for each row execute function private.block_resolved_automation();

create function public.service_begin_collection(source_name text, scheduled_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare token uuid; policy public.collection_policies; lease private.collection_leases;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select * into policy from public.collection_policies where source=source_name for update;
  if not found then raise exception 'UNKNOWN_SOURCE'; end if;
  if not policy.collection_enabled then return null; end if;
  select * into lease from private.collection_leases where source=source_name;
  if lease.expires_at > clock_timestamp() then return null; end if;
  update public.collection_runs set state='expired',finished_at=clock_timestamp(),failures='[{"error":"LEASE_EXPIRED"}]'
    where id=lease.run_id and state='running';
  insert into public.collection_runs(source,candidate_count,failures,scheduled_at,started_at,state)
    values(source_name,0,'[]',scheduled_at,clock_timestamp(),'running') returning id into token;
  insert into private.collection_leases values(source_name,token,clock_timestamp()+interval '15 minutes')
    on conflict(source) do update set run_id=excluded.run_id,expires_at=excluded.expires_at;
  return token;
end $$;

create function public.service_fail_collection(run_token uuid, attempt_count integer, failure_code text) returns void
language plpgsql security definer set search_path='' as $$
declare source_name text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select source into source_name from public.collection_runs where id=run_token;
  perform 1 from public.collection_policies where source=source_name for update;
  update public.collection_runs set state='failed',finished_at=clock_timestamp(),attempts=least(3,greatest(0,attempt_count)),
    failures=jsonb_build_array(jsonb_build_object('error',left(failure_code,100)))
    where id=run_token and state='running';
  delete from private.collection_leases where run_id=run_token;
end $$;

create function public.service_complete_collection(run_token uuid, batch jsonb, identities jsonb, attempt_count integer, adapter_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run public.collection_runs; policy public.collection_policies; item jsonb; candidate public.collection_candidates;
  p jsonb; target uuid; reason text; outcome text; published integer:=0; reviews integer:=0; previous_setting text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select * into run from public.collection_runs where id=run_token;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  select * into policy from public.collection_policies where source=run.source for update;
  select * into run from public.collection_runs where id=run_token;
  -- Serialize cross-source duplicates and manual concert edits with publication.
  lock table public.concerts in share row exclusive mode;
  if run.state in ('success','partial') then return jsonb_build_object('published',run.published_count,'review',run.review_count); end if;
  if run.state <> 'running' or not exists(select 1 from private.collection_leases where run_id=run_token and expires_at>clock_timestamp()) then raise exception 'LEASE_LOST'; end if;
  if not policy.collection_enabled then raise exception 'COLLECTION_DISABLED'; end if;
  -- Existing ingestion validates source paths and resolves all identities atomically.
  perform public.admin_ingest_catalog(run.source,batch,identities);
  for item in select value from jsonb_array_elements(batch->'candidates') loop
    select * into candidate from public.collection_candidates where source_url=item->>'source_url' for update;
    p:=candidate.payload; reason:=null; target:=null; outcome:='review';
    begin
    select concert_id into target from public.concert_sources where url=candidate.source_url limit 1;
    if candidate.automation_blocked then reason:='ADMIN_OVERRIDE';
    elsif target is not null then
      if exists(select 1 from public.collection_decisions d where d.candidate_id=candidate.id and d.outcome='published' and d.revision=candidate.revision)
        then outcome:='unchanged'; reason:='SAME_REVISION';
      else reason:='EXISTING_CONCERT_REVIEW'; end if;
    elsif not policy.publication_enabled then reason:='PUBLICATION_DISABLED';
    elsif service_complete_collection.adapter_version is distinct from policy.adapter_version then reason:='ADAPTER_VERSION';
    elsif coalesce(p->>'country_code','') <> 'KR' then reason:='KOREA_UNVERIFIED';
    elsif coalesce(p->>'title','')='' or coalesce(p->>'format','') not in ('solo','festival') or coalesce((p->>'cancelled')::boolean,false) then reason:='INVALID_EVENT';
    elsif nullif(p->>'starts_on','') is null or (p->>'starts_on')::date > coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date
      or coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date < (clock_timestamp() at time zone 'Asia/Seoul')::date then reason:='DATE_UNVERIFIED_OR_PAST';
    elsif coalesce((p->>'announcement_verified')::boolean,false) is not true or nullif(p->>'announced_on','') is null
      or (p->>'announced_on')::date > (clock_timestamp() at time zone 'Asia/Seoul')::date then reason:='ANNOUNCEMENT_UNVERIFIED';
    elsif jsonb_array_length(coalesce(p->'review_reasons','[]'))>0 then reason:='PARSER_REVIEW_REQUIRED';
    elsif jsonb_array_length(coalesce(p->'artist_keys','[]'))=0 or jsonb_array_length(p->'artist_keys')<>jsonb_array_length(p->'band_ids')
      or exists(select 1 from jsonb_array_elements_text(p->'artist_keys') k where not exists(select 1 from private.artist_publication_approvals a where a.identity_key=k))
      or exists(select 1 from jsonb_array_elements(coalesce(p->'discovered_artists','[]')) a where nullif(a->>'band_id','') is null) then reason:='ARTIST_OR_GENRE_UNVERIFIED';
    elsif not exists(select 1 from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url and nullif(s->>'verified_at','') is not null) then reason:='SOURCE_UNVERIFIED';
    elsif exists(select 1 from public.concerts c where
      lower(regexp_replace(c.title,'[[:space:][:punct:]]','','g'))=lower(regexp_replace(p->>'title','[[:space:][:punct:]]','','g'))
      or (c.starts_on <= coalesce(nullif(p->>'ends_on',''),p->>'starts_on')::date and coalesce(c.ends_on,c.starts_on)>=(p->>'starts_on')::date
        and exists(select 1 from public.concert_bands cb where cb.concert_id=c.id and cb.band_id in (select value::uuid from jsonb_array_elements_text(p->'band_ids'))))) then reason:='POSSIBLE_DUPLICATE_OR_CONFLICT';
    end if;
    exception when data_exception then reason:='INVALID_CANDIDATE_FIELDS'; target:=null;
    end;
    if reason is null then
      begin
        previous_setting:=current_setting('encore.initial_import',true);
        perform set_config('encore.initial_import',case when policy.live_after is null or run.started_at<=policy.live_after
          or (p->>'announced_on')::date <= (policy.live_after at time zone 'Asia/Seoul')::date then 'true' else 'false' end,true);
        insert into public.concerts(title,format) values(p->>'title',p->>'format') returning id into target;
        insert into public.concert_sources(concert_id,url,label,verified_at)
          values(target,candidate.source_url,run.source,(select (s->>'verified_at')::timestamptz from jsonb_array_elements(p->'sources') s where s->>'url'=candidate.source_url limit 1));
        insert into public.concert_bands(concert_id,band_id) select distinct target,value::uuid from jsonb_array_elements_text(p->'band_ids');
        insert into public.concert_sessions(concert_id,label,starts_on,starts_at)
          select target,s->>'label',nullif(s->>'starts_on','')::date,nullif(s->>'starts_at','')::timestamptz from jsonb_array_elements(coalesce(p->'sessions','[]')) s;
        insert into public.ticket_schedules(concert_id,opens_at,booking_url,price_description)
          values(target,nullif(p->'ticket'->>'opens_at','')::timestamptz,nullif(p->'ticket'->>'booking_url',''),nullif(p->'ticket'->>'price_description',''));
        update public.concerts set city=nullif(p->>'city',''),venue=nullif(p->>'venue',''),starts_on=(p->>'starts_on')::date,
          ends_on=nullif(p->>'ends_on','')::date,announced_on=(p->>'announced_on')::date,announced_at=nullif(p->>'announced_at','')::timestamptz,
          announcement_verified=true,status='published' where id=target;
        insert into private.catalog_history(concert_id,after_record) values(target,private.catalog_snapshot(target));
        perform set_config('encore.initial_import',coalesce(previous_setting,''),true);
        outcome:='published'; reason:='VERIFIED_NEW_EVENT'; published:=published+1;
      exception when data_exception or check_violation or not_null_violation then
        target:=null; outcome:='review'; reason:='INVALID_PUBLICATION_FIELDS';
      end;
    end if;
    if outcome='review' then reviews:=reviews+1; end if;
    insert into public.collection_decisions(run_id,candidate_id,revision,policy_version,outcome,reason,concert_id)
      values(run_token,candidate.id,candidate.revision,policy.adapter_version,outcome,reason,target);
  end loop;
  update public.collection_runs set state=case when jsonb_array_length(batch->'failures')=0 then 'success' else 'partial' end,
    candidate_count=jsonb_array_length(batch->'candidates'),failures=batch->'failures',excluded=coalesce(batch->'excluded','[]'),
    finished_at=clock_timestamp(),attempts=least(3,greatest(1,attempt_count)),published_count=published,review_count=reviews where id=run_token;
  delete from private.collection_leases where run_id=run_token;
  return jsonb_build_object('published',published,'review',reviews);
end $$;

-- RPCs have explicit role grants. No public or ordinary-user worker access.
revoke all on function public.service_begin_collection(text,timestamptz), public.service_fail_collection(uuid,integer,text), public.service_complete_collection(uuid,jsonb,jsonb,integer,text) from public;
grant execute on function public.service_begin_collection(text,timestamptz), public.service_fail_collection(uuid,integer,text), public.service_complete_collection(uuid,jsonb,jsonb,integer,text) to service_role;
revoke all on function public.admin_collection_policy(text,boolean,boolean,boolean), public.admin_approve_artist(text,text), public.admin_candidate_automation(uuid,boolean) from public;
grant execute on function public.admin_collection_policy(text,boolean,boolean,boolean), public.admin_approve_artist(text,text), public.admin_candidate_automation(uuid,boolean) to authenticated;
revoke all on function private.block_resolved_automation() from public;

create function public.admin_collection_health() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  return (select jsonb_agg(to_jsonb(p)||jsonb_build_object(
    'last_success',(select max(r.finished_at) from public.collection_runs r where r.source=p.source and r.state='success'),
    'last_run',(select to_jsonb(r) from public.collection_runs r where r.source=p.source and r.state<>'legacy' order by r.created_at desc limit 1),
    'attention_required',p.collection_enabled and (
      not exists(select 1 from public.collection_runs r where r.source=p.source and r.state='success' and r.finished_at>clock_timestamp()-interval '2 hours')
      or (select count(*) from (select r.state from public.collection_runs r where r.source=p.source and r.state<>'legacy' order by r.created_at desc limit 2) recent where state in ('failed','expired','partial'))>=2)
  ) order by p.source) from public.collection_policies p);
end $$;
revoke all on function public.admin_collection_health() from public;
grant execute on function public.admin_collection_health() to authenticated;

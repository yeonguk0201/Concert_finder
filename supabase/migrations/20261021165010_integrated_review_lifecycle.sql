alter table private.integrated_review_runs add column finished_at timestamptz;

create or replace function public.service_begin_integrated_review(run_id uuid, targets jsonb,
  batch_started_at timestamptz default clock_timestamp()) returns void
language plpgsql security definer set search_path='' as $$
declare existing private.integrated_review_runs; readiness jsonb;
begin
  perform private.integrated_review_service();
  perform pg_advisory_xact_lock(20261020,40);
  if run_id is null or jsonb_typeof(targets) is distinct from 'array'
    or jsonb_array_length(targets) not between 1 and 40
    or exists(select 1 from jsonb_array_elements(targets) t where t->>'bandId' is null or t->>'expectedUpdatedAt' is null)
    or (select count(distinct t->>'bandId') from jsonb_array_elements(targets) t)<>jsonb_array_length(targets)
    then raise exception 'SELECTION_INVALID'; end if;
  select * into existing from private.integrated_review_runs r where r.id=run_id;
  if found then
    if existing.targets is distinct from targets then raise exception 'SELECTION_CONFLICT'; end if;
    if existing.finished_at is not null then raise exception 'RUN_FINISHED'; end if;
    return;
  end if;
  -- Preserve the source start for lease expiry, not scheduler cadence.
  -- Only a newly starting batch can register; retries of an existing ID returned above.
  if batch_started_at is null or batch_started_at>clock_timestamp()+interval '1 minute'
    or batch_started_at<clock_timestamp()-interval '30 minutes' then raise exception 'LEASE_LOST'; end if;
  if exists(select 1 from private.integrated_review_runs where finished_at is null
    and started_at>clock_timestamp()-interval '5 hours')
    then raise exception 'INTEGRATED_REVIEW_BUSY'; end if;
  -- The dedicated runner is optional in fresh checkouts, and must be idle when installed.
  if to_regprocedure('public.service_artist_review_readiness()') is not null then
    execute 'select public.service_artist_review_readiness()' into readiness;
    if readiness->>'state'='busy' or readiness->>'reason'='lease_recovery' then raise exception 'LEGACY_REVIEW_NOT_FINISHED'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(targets) t left join public.bands b on b.id=(t->>'bandId')::uuid
    where b.id is null or b.updated_at is distinct from (t->>'expectedUpdatedAt')::timestamptz)
    then raise exception 'EDIT_CONFLICT'; end if;
  insert into private.integrated_review_runs(id,targets,started_at) values(run_id,targets,batch_started_at);
end $$;

create or replace function public.service_apply_integrated_review(run_id uuid, proposal jsonb, proof jsonb,
  requirements jsonb, approval_evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.integrated_review_runs; receipt private.integrated_review_receipts;
  b public.bands; after_band public.bands; target uuid; status text; new_category text;
  submitted jsonb; relations jsonb; source jsonb; field text; readiness jsonb;
begin
  perform private.integrated_review_service();
  lock table public.bands in share row exclusive mode;
  select * into job from private.integrated_review_runs r where r.id=run_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  target:=(proposal->>'target_band_id')::uuid;
  if not exists(select 1 from jsonb_array_elements(job.targets) t where t->>'bandId'=target::text
    and (t->>'expectedUpdatedAt')::timestamptz=(proposal->>'expected_updated_at')::timestamptz)
    then raise exception 'TARGET_NOT_SELECTED'; end if;
  submitted:=jsonb_build_object('proposal',proposal,'proof',proof,'requirements',requirements,'approvalEvidence',approval_evidence);
  if length(submitted::text)>50000 then raise exception 'INVALID_RESULT'; end if;
  select * into receipt from private.integrated_review_receipts r where r.run_id=job.id and r.band_id=target;
  if found then
    if receipt.submitted is distinct from submitted then raise exception 'CHECKPOINT_CONFLICT'; end if;
    return jsonb_build_object('runId',job.id,'after',receipt.after_record,'relations',receipt.relations);
  end if;
  if job.finished_at is not null then raise exception 'RUN_FINISHED'; end if;
  if job.started_at<=clock_timestamp()-interval '5 hours' then raise exception 'LEASE_LOST'; end if;
  if to_regprocedure('public.service_artist_review_readiness()') is not null then
    execute 'select public.service_artist_review_readiness()' into readiness;
    if readiness->>'state'='busy' or readiness->>'reason'='lease_recovery' then raise exception 'LEGACY_REVIEW_NOT_FINISHED'; end if;
  end if;
  select * into b from public.bands where id=target for update;
  if b.updated_at is distinct from (proposal->>'expected_updated_at')::timestamptz then raise exception 'EDIT_CONFLICT'; end if;
  if b.curation_status<>'unreviewed' or b.curation_reason<>'' or exists(
    select 1 from private.artist_management_history h where h.band_id=b.id and h.actor_id is not null
      and (h.before_record->'curation_status' is distinct from h.after_record->'curation_status'
        or h.before_record->'curation_reason' is distinct from h.after_record->'curation_reason'
        or h.before_record->'category' is distinct from h.after_record->'category'))
    then raise exception 'MANUAL_DECISION'; end if;
  status:=proposal->>'review_status'; new_category:=proposal->>'artist_category';
  if proposal->>'artist_name' is distinct from b.name or proposal->>'country' is distinct from b.country_code
    or proposal->'artist_aliases' is distinct from to_jsonb(b.aliases)
    or status is null or status not in ('approved','excluded','held')
    or new_category is null or new_category not in ('unclassified','domestic_rock','overseas_rock','jpop')
    or length(trim(coalesce(proposal->>'reason',''))) not between 1 and 2000
    or coalesce(proposal->>'evidence_url','') !~ '^https://[^ /[:space:]]+(/[^[:space:]]*)?$'
    then raise exception 'PROPOSAL_INVALID'; end if;
  if proof->>'decision' is distinct from (case status when 'approved' then 'keep' when 'excluded' then 'exclude' else 'hold' end)
    or length(trim(coalesce(proof->>'summary',''))) not between 1 and 2000
    or jsonb_typeof(proof->'sources') is distinct from 'array' then raise exception 'PROOF_REQUIRED'; end if;
  if jsonb_array_length(proof->'sources') not between 1 and 10 then raise exception 'PROOF_REQUIRED'; end if;
  for source in select value from jsonb_array_elements(proof->'sources') loop
    if coalesce(source->>'url','') !~ '^https://[^ /[:space:]]+(/[^[:space:]]*)?$'
      or coalesce(source->>'url','') ~* '(https://[^/]*@|[?&](key|api_?key|token|access_token|refresh_token|secret|password|authorization)=)'
      or nullif(source->>'checkedAt','') is null
      or (source->>'checkedAt')::timestamptz>clock_timestamp()
      or (source->>'checkedAt')::timestamptz<=clock_timestamp()-interval '90 days'
      or length(trim(coalesce(source->>'excerpt',source->>'summary',''))) not between 1 and 1000
      then raise exception 'SOURCE_INVALID'; end if;
  end loop;
  if not exists(select 1 from jsonb_array_elements(proof->'sources') s where s->>'url'=proposal->>'evidence_url')
    then raise exception 'EVIDENCE_NOT_IN_RESEARCH'; end if;
  if status='approved' then
    foreach field in array array['identityMatched','countryMatched','genreMatched','classificationMatched','externalIdentityLinked','publicationEffectUnderstood'] loop
      if requirements->field is distinct from 'true'::jsonb
        or length(trim(coalesce(approval_evidence->field->>'summary',''))) not between 1 and 2000
        or jsonb_typeof(approval_evidence->field->'sourceUrls') is distinct from 'array'
        then raise exception 'APPROVAL_REQUIREMENTS_REQUIRED'; end if;
      if jsonb_array_length(approval_evidence->field->'sourceUrls')=0 or exists(
        select 1 from jsonb_array_elements_text(approval_evidence->field->'sourceUrls') u
        where not exists(select 1 from jsonb_array_elements(proof->'sources') s where s->>'url'=u))
        then raise exception 'APPROVAL_REQUIREMENTS_REQUIRED'; end if;
    end loop;
    if new_category='unclassified' or (new_category='domestic_rock' and b.country_code<>'KR')
      or (new_category='overseas_rock' and b.country_code='KR') then raise exception 'CLASSIFICATION_CONFLICT'; end if;
    if b.musicbrainz_id is null or not exists(select 1 from private.artist_identities i
      where i.band_id=b.id and i.identity_key='mb:'||b.musicbrainz_id::text) then raise exception 'IDENTITY_REQUIRED'; end if;
  elsif new_category is distinct from b.category then raise exception 'CLASSIFICATION_CONFLICT'; end if;
  select jsonb_build_array((select count(*) from public.concert_bands where band_id=b.id),
    (select count(*) from public.band_follows where band_id=b.id)) into relations;
  update public.bands set category=new_category, curation_status=status,
    curation_reason=proposal->>'reason',curation_evidence_url=proposal->>'evidence_url' where id=b.id returning * into after_band;
  if status='approved' then
    insert into private.artist_publication_approvals(identity_key,evidence_url,approved_by,integrated_run_id)
      select i.identity_key,proposal->>'evidence_url',null,job.id from private.artist_identities i where i.band_id=b.id
      on conflict on constraint artist_publication_approvals_pkey do update set evidence_url=excluded.evidence_url,
        approved_by=null,integrated_run_id=excluded.integrated_run_id,approved_at=clock_timestamp();
  end if;
  insert into private.integrated_review_receipts(run_id,band_id,submitted,before_record,after_record,relations)
    values(job.id,b.id,submitted,to_jsonb(b),to_jsonb(after_band),relations);
  return jsonb_build_object('runId',job.id,'after',to_jsonb(after_band),'relations',relations);
end $$;

create or replace function public.service_integrated_review_receipt(run_id uuid, band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.integrated_review_service();
  return (select jsonb_build_object('runId',r.run_id,'before',r.before_record,'after',r.after_record,'relations',r.relations,
    'publicationApproved',exists(select 1 from private.artist_identities i where i.band_id=r.band_id) and
      not exists(select 1 from private.artist_identities i where i.band_id=r.band_id
      and not exists(select 1 from private.artist_publication_approvals a where a.identity_key=i.identity_key and a.integrated_run_id=r.run_id)))
    from private.integrated_review_receipts r where r.run_id=service_integrated_review_receipt.run_id
      and r.band_id=service_integrated_review_receipt.band_id);
end $$;
create or replace function public.service_integrated_review_context(run_id uuid, band_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform private.integrated_review_service();
  if not exists(select 1 from private.integrated_review_runs r, jsonb_array_elements(r.targets) t
    where r.id=run_id and r.finished_at is null and t->>'bandId'=band_id::text and r.started_at>clock_timestamp()-interval '5 hours')
    then raise exception 'TARGET_NOT_SELECTED'; end if;
  return (select jsonb_build_object('band',to_jsonb(b),'identities',coalesce((select jsonb_agg(
    jsonb_build_object('key',i.identity_key,'evidenceUrl',i.evidence_url)) from private.artist_identities i where i.band_id=b.id),'[]'::jsonb))
    from public.bands b where b.id=band_id);
end $$;

create function public.service_finish_integrated_review(run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job private.integrated_review_runs;
begin
  perform private.integrated_review_service();
  perform pg_advisory_xact_lock(20261020,40);
  select * into job from private.integrated_review_runs r where r.id=run_id for update;
  if not found then raise exception 'RUN_NOT_FOUND'; end if;
  if job.finished_at is null then
    update private.integrated_review_runs r set finished_at=clock_timestamp() where r.id=run_id
      returning * into job;
  end if;
  return jsonb_build_object('runId',job.id,'finishedAt',job.finished_at);
end $$;
revoke all on function public.service_finish_integrated_review(uuid) from public,anon,authenticated;
grant execute on function public.service_finish_integrated_review(uuid) to service_role;

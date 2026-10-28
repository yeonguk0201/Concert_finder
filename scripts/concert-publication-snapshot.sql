-- Read-only operational snapshot. Never reads personal rows, push keys, Vault or cron commands.
-- Permission and adapter certification deliberately start unverified; supply actual
-- independently reviewed evidence before assessing readiness, never infer it from NOL exclusion.
with candidates as (
select c.id,c.source_url,c.revision,c.automation_blocked,c.payload,c.previous_payload,
 case split_part(c.source_url,'/',3) when 'ualive.com' then 'ualive' when 'www.mintpaper.co.kr' then 'mintpaper' when 'radwimps.jp' then 'radwimps' when 'www.kopis.or.kr' then 'kopis' when 'ticket.yes24.com' then 'yes24' end source
from public.collection_candidates c),
projected as(select c.source,jsonb_build_object('id',c.id,'source_url',c.source_url,'revision',c.revision,'automation_blocked',c.automation_blocked,
'payload',jsonb_build_object('title',c.payload->'title','format',c.payload->'format','country_code',c.payload->'country_code','city',c.payload->'city','venue',c.payload->'venue','cancelled',c.payload->'cancelled','starts_on',c.payload->'starts_on','ends_on',c.payload->'ends_on','sessions',c.payload->'sessions','announced_on',c.payload->'announced_on','announced_at',c.payload->'announced_at','announcement_verified',c.payload->'announcement_verified','review_reasons',c.payload->'review_reasons','sources',c.payload->'sources','ticket',jsonb_build_object('opens_at',c.payload#>'{ticket,opens_at}','booking_url',c.payload#>'{ticket,booking_url}'),'ticket_evidence',coalesce(c.payload->'ticket_evidence','[]'),'initial_import',c.payload->'initial_import'),
'context',jsonb_build_object(
'identityApproved',not exists(select 1 from jsonb_array_elements(coalesce(c.payload->'discovered_artists','[]')) a where nullif(a->>'band_id','') is null) and jsonb_array_length(coalesce(c.payload->'artist_keys','[]'))>0
 and jsonb_array_length(coalesce(c.payload->'artist_keys','[]'))=jsonb_array_length(coalesce(c.payload->'band_ids','[]'))
 and not exists(select 1 from jsonb_array_elements_text(coalesce(c.payload->'artist_keys','[]')) k where not exists(select 1 from private.artist_publication_approvals a join private.artist_identities i on i.identity_key=a.identity_key join public.bands b on b.id=i.band_id where a.identity_key=k and b.curation_status='approved' and coalesce(c.payload->'band_ids','[]') ? b.id::text)),
'duplicateFree',not exists(select 1 from public.concert_sources cs where cs.url=c.source_url)
 and not exists(select 1 from public.concerts x where lower(regexp_replace(x.title,'[[:space:][:punct:]]','','g'))=lower(regexp_replace(c.payload->>'title','[[:space:][:punct:]]','','g'))
 or (x.starts_on::text <= coalesce(c.payload->>'ends_on',c.payload->>'starts_on') and coalesce(x.ends_on,x.starts_on)::text >= c.payload->>'starts_on'
 and exists(select 1 from public.concert_bands cb where cb.concert_id=x.id and coalesce(c.payload->'band_ids','[]') ? cb.band_id::text))),
'changeReviewed',c.previous_payload is null or c.previous_payload=c.payload)) row
from candidates c where c.source is not null)
select jsonb_build_object('version',1,'observedAt',clock_timestamp(),
'sources',(select jsonb_agg(jsonb_build_object('source',p.source,'policy',to_jsonb(p),'permission',jsonb_build_object('state','unverified'),
'adapterVersion','catalog-v1','adapterVerified',false,'runnerCompatible',p.source<>'kopis','activeLease',exists(select 1 from private.collection_leases l where l.source=p.source and l.expires_at>clock_timestamp()),'candidates',coalesce((select jsonb_agg(row) from projected x where x.source=p.source),'[]')) order by p.source) from public.collection_policies p)) as snapshot;

-- W31: expose approved artists only; retain rows and existing relationships.
drop policy bands_read on public.bands;
create policy bands_read on public.bands for select to anon, authenticated
  using (curation_status = 'approved');
-- The existing bands_admin policy and admin_catalog RPC retain review access.
drop policy follows_insert on public.band_follows;
create policy follows_insert on public.band_follows for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (
    select 1 from public.bands b where b.id = band_id and b.curation_status = 'approved'
  ));

create or replace function public.artist_official_profiles() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('band_id',p.band_id,'website_url',p.website_url,
    'channel_url',p.channel_url,'photo',case when c.expires_at>now() and p.last_status not in ('needs_review','unavailable') then
      jsonb_build_object('url',coalesce(c.cache#>>'{thumbnails,high,url}',c.cache#>>'{thumbnails,medium,url}',c.cache#>>'{thumbnails,default,url}'),
        'channelUrl','https://www.youtube.com/channel/'||(c.cache->>'channelId'),'checkedAt',c.checked_at,'expiresAt',c.expires_at)
      else null end)),'[]'::jsonb)
  from private.artist_channels p join public.bands b on b.id=p.band_id
    left join private.artist_channel_cache c on c.band_id=p.band_id
  where b.curation_status = 'approved' and b.musicbrainz_id=p.musicbrainz_id and private.channel_evidence_valid(p)
    and p.last_status not in ('needs_review','unavailable');
$$;

-- CREATE OR REPLACE preserves the existing explicit anon/authenticated grants.

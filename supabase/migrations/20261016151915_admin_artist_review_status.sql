-- Read-only companion to admin_resume_artist_review. Never grant the runner resumption rights.
create function public.admin_artist_review_status(target_band_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  select jsonb_build_object(
    'name',b.name,'band_version',b.updated_at,'curation_status',b.curation_status,
    'target_enabled',coalesce(t.enabled,false),
    'can_resume',coalesce(t.enabled and b.curation_status='unreviewed' and s.outcome='action_required',false),
    'state',case when s.band_id is null then null else jsonb_build_object(
      'outcome',s.outcome,'checked_at',s.checked_at,'error',s.result->>'error',
      'genre_summary',s.result#>>'{genre,summary}','channel_summary',s.result#>>'{channel,summary}') end
  ) into result from public.bands b
    left join private.artist_review_targets t on t.band_id=b.id
    left join private.artist_review_state s on s.band_id=b.id
    where b.id=target_band_id;
  if result is null then raise exception 'ARTIST_NOT_FOUND'; end if;
  return result;
end $$;
revoke all on function public.admin_artist_review_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_artist_review_status(uuid) to authenticated;

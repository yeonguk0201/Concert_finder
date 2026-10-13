-- Public clients cannot read private identities or choose a band's provider ID.
create function public.service_artist_photo_identity(band uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare identity text;
begin
  if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role' then raise exception 'SERVICE_REQUIRED'; end if;
  select substring(i.identity_key from 4) into identity from private.artist_identities i
    where i.band_id = band and i.identity_key ~ '^mb:[a-f0-9-]{36}$'
    order by i.identity_key limit 1;
  return identity;
end $$;
revoke all on function public.service_artist_photo_identity(uuid) from public;
grant execute on function public.service_artist_photo_identity(uuid) to service_role;

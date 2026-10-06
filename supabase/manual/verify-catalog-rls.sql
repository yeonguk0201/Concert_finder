-- Run the WHOLE file in SQL Editor after at least one non-admin user logs in.
-- All temporary catalog records are rolled back. No admin is added.
-- This checks database authorization, not browser JWT issuance or A/B UI isolation.
begin;
create temporary table rls_probe (band_id uuid, concert_id uuid) on commit drop;
insert into rls_probe values (gen_random_uuid(), gen_random_uuid());
grant select on rls_probe to authenticated;
do $$
declare ordinary_user uuid;
begin
  select u.id into ordinary_user from auth.users u
  where not exists (select 1 from private.admins a where a.user_id = u.id)
  order by u.id limit 1;
  if ordinary_user is null then
    raise exception 'Log in with a non-admin account before running this check';
  end if;
  perform set_config('request.jwt.claim.sub', ordinary_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', ordinary_user, 'role', 'authenticated')::text, true);
end;
$$;
insert into public.bands (id, name, country_code)
select band_id, 'Transient RLS probe', 'GB' from rls_probe;
insert into public.concerts (id, title, format)
select concert_id, 'Transient RLS probe', 'solo' from rls_probe;
set local role authenticated;
do $$
declare affected integer;
begin
  if auth.uid() is null or private.is_admin() then
    raise exception 'Expected an authenticated non-admin';
  end if;
  begin
    insert into public.bands (name, country_code) values ('Must be rejected', 'GB');
    raise exception 'FAIL: non-admin inserted a band';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.concerts (title, format) values ('Must be rejected', 'solo');
    raise exception 'FAIL: non-admin inserted a concert';
  exception when insufficient_privilege then null;
  end;
  update public.bands set name = 'Must not change' where id = (select band_id from rls_probe);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: non-admin updated a band'; end if;
  delete from public.bands where id = (select band_id from rls_probe);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: non-admin deleted a band'; end if;
  update public.concerts set title = 'Must not change' where id = (select concert_id from rls_probe);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: non-admin updated a concert'; end if;
  delete from public.concerts where id = (select concert_id from rls_probe);
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'FAIL: non-admin deleted a concert'; end if;
  begin
    insert into private.admins (user_id) values (auth.uid());
    raise exception 'FAIL: non-admin elevated privileges';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from public.bands where id = (select band_id from rls_probe) and name = 'Transient RLS probe')
    or not exists (select 1 from public.concerts where id = (select concert_id from rls_probe) and title = 'Transient RLS probe') then
    raise exception 'FAIL: probe records changed';
  end if;
end;
$$;
select 'PASS: non-admin catalog changes and self-elevation blocked; probe changes rolled back below' as result;
rollback;
-- If a FAIL/error occurs, stop and execute ROLLBACK before investigating.

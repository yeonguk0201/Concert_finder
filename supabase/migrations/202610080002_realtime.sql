-- Realtime contains invalidation counters only, never private row payloads.
-- INSERT/UPDATE signals also cover deletes, withdrawals and cascade removals.
create table public.catalog_signal (id integer primary key check(id=1), revision bigint not null default 0);
insert into public.catalog_signal values(1,0);
create table public.account_signals (user_id uuid primary key references auth.users(id) on delete cascade, revision bigint not null default 0);
alter table public.catalog_signal enable row level security;
alter table public.account_signals enable row level security;
grant select on public.catalog_signal to anon,authenticated;
grant select on public.account_signals to authenticated;
create policy public_signal on public.catalog_signal for select to anon,authenticated using(true);
create policy owner_signal on public.account_signals for select to authenticated using(user_id=(select auth.uid()));

create function private.signal_catalog() returns trigger
language plpgsql security definer set search_path = '' as $$
declare visible boolean;
begin
  if tg_table_name = 'bands' then visible := true;
  elsif tg_table_name = 'concerts' then
    visible := (tg_op <> 'INSERT' and old.status='published') or (tg_op <> 'DELETE' and new.status='published');
  else
    select exists(select 1 from public.concerts where id=coalesce(new.concert_id,old.concert_id) and status='published') into visible;
  end if;
  if visible then update public.catalog_signal set revision=revision+1 where id=1; end if;
  return null;
end $$;
revoke all on function private.signal_catalog() from public;
do $$ declare t text; begin
  foreach t in array array['bands','concerts','concert_sources','concert_bands','concert_sessions','ticket_schedules'] loop
    execute format('create trigger catalog_signal after insert or update or delete on public.%I for each row execute function private.signal_catalog()', t);
  end loop;
end $$;
create function private.signal_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := coalesce(new.user_id,old.user_id);
begin
  if exists(select 1 from auth.users where id=owner_id) then
    insert into public.account_signals(user_id,revision) values(owner_id,1)
      on conflict(user_id) do update set revision=account_signals.revision+1;
  end if;
  return null;
end $$;
revoke all on function private.signal_account() from public;
create trigger account_signal after insert or update or delete on public.band_follows for each row execute function private.signal_account();
create trigger account_signal after insert or update or delete on public.saved_schedules for each row execute function private.signal_account();
do $$ declare t text; begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
  foreach t in array array['catalog_signal','account_signals'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

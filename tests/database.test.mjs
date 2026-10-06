import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('migration: publication, isolation, ownership, cancellation and cascade', async () => {
  const db = new PGlite()
  const a = '00000000-0000-0000-0000-000000000001'
  const b = '00000000-0000-0000-0000-000000000002'
  const admin = '00000000-0000-0000-0000-000000000003'
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated;
      grant execute on function auth.uid() to anon, authenticated;`)
    await db.exec(await readFile(new URL('../supabase/migrations/202610060001_initial.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into auth.users values ('${a}'), ('${b}'), ('${admin}');
      insert into private.admins values ('${admin}');`)
    const registration = await readFile(new URL('../supabase/manual/register-oasis.sql', import.meta.url), 'utf8')
    await db.exec(registration)
    await db.exec(registration)
    assert.equal((await db.query('select * from public.bands')).rows.length, 1)
    await db.exec('delete from public.bands')
    const remoteProbe = await readFile(new URL('../supabase/manual/verify-catalog-rls.sql', import.meta.url), 'utf8')
    await db.exec(remoteProbe)
    assert.equal((await db.query('select * from public.bands')).rows.length, 0)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    // The probe must fail when a non-admin write policy is accidentally opened.
    await db.exec('create policy broken_write on public.bands for insert to authenticated with check (true)')
    await assert.rejects(db.exec(remoteProbe), /FAIL: non-admin inserted a band/)
    await db.exec('rollback; reset role; drop policy broken_write on public.bands')
    const role = async (user) => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ''])
      await db.exec(`set role ${user ? 'authenticated' : 'anon'}`)
    }
    await role(admin)
    const band = (await db.query("insert into public.bands(name,country_code) values ('Overseas', 'GB') returning id")).rows[0].id
    const domestic = (await db.query("insert into public.bands(name,country_code) values ('Domestic', 'KR') returning id")).rows[0].id
    const concert = (await db.query("insert into public.concerts(title,format,starts_on,ends_on,announced_on,announcement_verified) values ('Mixed festival','festival','2026-12-12','2026-12-13','2026-10-06',true) returning id")).rows[0].id
    await assert.rejects(db.query("update public.concerts set status='published' where id=$1", [concert]), /Publication requires/)
    await db.query("insert into public.concert_sources(concert_id,url,label,verified_at) values ($1,'https://official.example/event','Official',now())", [concert])
    await db.query('insert into public.concert_bands(concert_id,band_id) values ($1,$2),($1,$3)', [concert, band, domestic])
    const schedule = (await db.query('insert into public.ticket_schedules(concert_id) values ($1) returning id', [concert])).rows[0].id
    await role(null)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    assert.equal((await db.query('select * from public.ticket_schedules')).rows.length, 0)
    await assert.rejects(db.query('select * from public.saved_schedules'), /permission denied/)
    await role(a)
    await assert.rejects(db.query('insert into public.saved_schedules(ticket_schedule_id) values($1)', [schedule]), /row-level security/)
    await assert.rejects(db.query("insert into public.bands(name,country_code) values('Attack','KR')"), /row-level security/)
    await assert.rejects(db.query('insert into private.admins values($1)', [a]), /permission denied/)
    await role(admin)
    const first = (await db.query("update public.concerts set status='published' where id=$1 returning first_published_at", [concert])).rows[0].first_published_at
    await db.query("update public.concerts set title='Updated', first_published_at=now() where id=$1", [concert])
    assert.equal((await db.query('select first_published_at from public.concerts where id=$1', [concert])).rows[0].first_published_at.getTime(), first.getTime())
    await db.query("update public.ticket_schedules set opens_at='2026-11-01T10:00:00+09:00' where id=$1", [schedule])
    assert.equal((await db.query('select revision from public.ticket_schedules')).rows[0].revision, 2)
    await role(a)
    assert.equal((await db.query('select * from public.concert_bands')).rows.length, 2)
    await db.query('insert into public.band_follows(band_id) values($1)', [band])
    await db.query('insert into public.saved_schedules(ticket_schedule_id) values($1)', [schedule])
    await db.exec('insert into public.notification_preferences default values')
    await assert.rejects(db.query('insert into public.band_follows(user_id,band_id) values($1,$2)', [b, band]), /row-level security/)
    await role(b)
    for (const table of ['band_follows', 'saved_schedules', 'notification_preferences']) {
      assert.equal((await db.query(`select * from public.${table}`)).rows.length, 0)
      assert.equal((await db.query(`delete from public.${table} where user_id=$1 returning *`, [a])).rows.length, 0)
    }
    await assert.rejects(db.query('insert into public.saved_schedules(user_id,ticket_schedule_id) values($1,$2)', [a, schedule]), /row-level security/)
    await db.query('insert into public.band_follows(band_id) values($1)', [domestic])
    await role(admin)
    await db.query('update public.concerts set cancelled=true where id=$1', [concert])
    await role(b)
    await assert.rejects(db.query('insert into public.saved_schedules(ticket_schedule_id) values($1)', [schedule]), /row-level security/)
    await role(admin)
    await db.query("update public.concerts set status='withdrawn' where id=$1", [concert])
    await role(a)
    assert.equal((await db.query('select * from public.concerts')).rows.length, 0)
    // Owners can remove a save even after its concert is withdrawn.
    assert.equal((await db.query('delete from public.saved_schedules returning *')).rows.length, 1)
    await db.exec('reset role')
    await db.query('delete from auth.users where id=$1', [a])
    assert.equal((await db.query('select * from public.band_follows where user_id=$1', [a])).rows.length, 0)
    assert.equal((await db.query('select * from public.notification_preferences where user_id=$1', [a])).rows.length, 0)
    assert.equal((await db.query('select * from public.band_follows where user_id=$1', [b])).rows.length, 1)
  } finally { await db.close() }
})

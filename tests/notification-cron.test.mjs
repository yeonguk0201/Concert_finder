import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { prepareConfiguration } from '../scripts/prepare-supabase-push.mjs'

test('cron setup updates one named job, resolves Vault secrets at runtime, and rejects missing/duplicate secrets', async () => {
  const db = new PGlite()
  try {
    // Hosted-only extensions are represented by narrow SQL doubles; do not claim this tests pg_cron/pg_net itself.
    await db.exec(`
      create schema vault; create schema cron; create schema net;
      create table vault.secrets(id uuid primary key default gen_random_uuid(), name text, secret text);
      create view vault.decrypted_secrets as select id,name,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(new_secret text,new_name text) returns uuid language sql as $$
        insert into vault.secrets(name,secret) values(new_name,new_secret) returning id $$;
      create function vault.update_secret(target uuid,new_secret text,new_name text) returns void language sql as $$
        update vault.secrets set secret=new_secret,name=new_name where id=target $$;
      create table cron.job(jobname text primary key,schedule text,command text);
      create function cron.schedule(name text,expression text,sql_command text) returns bigint language sql as $$
        insert into cron.job values(name,expression,sql_command) on conflict(jobname) do update
          set schedule=excluded.schedule,command=excluded.command returning 1::bigint $$;
      create table net.requests(url text,headers jsonb,body jsonb,timeout_milliseconds integer);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
        insert into net.requests values(url,headers,body,timeout_milliseconds) returning 1::bigint $$;
    `)
    const configuration = prepareConfiguration({ SUPABASE_URL: 'https://testproject.supabase.co',
      VAPID_PUBLIC_KEY: 'test-public', VAPID_PRIVATE_KEY: 'test-private', VAPID_SUBJECT: 'mailto:test@example.test' }, 'a'.repeat(64))
    const sql = (await readFile('supabase/manual/schedule-notifications.sql', 'utf8')).replace(/^create extension[^;]+;/gm, '')
    await assert.rejects(db.exec(sql), /Create exactly one/)
    await db.exec(configuration.sql)
    await db.exec(configuration.sql)
    assert.equal((await db.query('select count(*)::int as n from vault.secrets')).rows[0].n, 2)
    await db.exec(sql)
    await db.exec(sql)
    const jobs = (await db.query('select * from cron.job')).rows
    assert.equal(jobs.length, 1)
    assert.equal(jobs[0].schedule, '* * * * *')
    assert.equal(jobs[0].command.includes('a'.repeat(64)), false)
    assert.equal(jobs[0].command.includes('test-private'), false)
    await db.exec(jobs[0].command)
    const call = (await db.query('select * from net.requests')).rows[0]
    assert.equal(call.url, 'https://testproject.supabase.co/functions/v1/notification-delivery')
    assert.equal(call.headers.Authorization, 'Bearer ' + 'a'.repeat(64))
    assert.equal(call.timeout_milliseconds, 110000)
    await db.exec("insert into vault.secrets(name,secret) values('encore_notification_token','duplicate')")
    await assert.rejects(db.exec(sql), /Create exactly one/)
  } finally { await db.close() }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('worker migration removes explicit API grants while retaining service execution', async () => {
  const db = new PGlite()
  try {
    // Reproduce production's explicit default grants, which a PUBLIC revoke misses.
    await db.exec(`create role anon; create role authenticated; create role service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated;
      create function public.service_begin_collection(text,timestamptz) returns uuid language sql as $$ select null::uuid $$;
      create function public.service_fail_collection(uuid,integer,text) returns void language sql as $$ select $$;
      create function public.service_complete_collection(uuid,jsonb,jsonb,integer,text) returns jsonb language sql as $$ select '{}'::jsonb $$;
      revoke all on function public.service_begin_collection(text,timestamptz) from public;`)
    assert.equal((await db.query("select has_function_privilege('anon','public.service_begin_collection(text,timestamptz)','execute') allowed")).rows[0].allowed, true)
    await db.exec(await readFile(new URL('../supabase/migrations/20261020055804_collection_worker_permissions.sql', import.meta.url), 'utf8'))
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select public.service_begin_collection(null,null)'), /permission denied/)
      await assert.rejects(db.query('select public.service_fail_collection(null,null,null)'), /permission denied/)
      await assert.rejects(db.query('select public.service_complete_collection(null,null,null,null,null)'), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    await db.query('select public.service_begin_collection(null,null)')
    await db.query('select public.service_fail_collection(null,null,null)')
    await db.query('select public.service_complete_collection(null,null,null,null,null)')
  } finally { await db.close() }
})

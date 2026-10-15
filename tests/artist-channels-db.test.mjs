import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('official profiles enforce identities, optimistic edits, grants, locks, expiry and hidden artists without touching manual photos', async () => {
  const db = new PGlite()
  try {
    const admin='00000000-0000-4000-8000-000000000099', mbid='00000000-0000-4000-8000-000000000001'
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;`)
    for (const name of ['202610060001_initial','202610070001_admin_review','202610080001_ingestion','202610090001_notifications','202610110001_catalog_expansion','20261011150237_discovered_artist_catalog','20261012134538_automated_catalog','20261012135134_artist_management','20261013070742_artist_curation']) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8'))
    }
    await db.exec('create table public.catalog_signal(id int primary key,revision bigint); insert into public.catalog_signal values(1,0)')
    await db.exec(await readFile(new URL('../supabase/migrations/20261015122525_artist_official_channels.sql',import.meta.url),'utf8'))
    await db.query('insert into auth.users values($1)',[admin]); await db.query('insert into private.admins values($1)',[admin])
    await db.query("select set_config('test.uid',$1,false)",[admin])
    await db.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
    const bandId=(await db.query('select public.service_import_artist($1) as id',[{key:`mb:${mbid}`,name:'Artist',country:'JP',aliases:[],genre:'Unknown',evidence:`https://musicbrainz.org/artist/${mbid}`}])).rows[0].id
    const version = async () => (await db.query("select to_jsonb(b)->>'updated_at' as v from public.bands b where id=$1",[bandId])).rows[0].v
    const id='UC'+'a'.repeat(22), channel=`https://www.youtube.com/channel/${id}`
    const profile={musicBrainzId:mbid,websiteUrl:'https://official.example.com',channelUrl:channel,verification:'verified',locked:false,evidence:[{kind:'official_artist_page',url:'https://official.example.com/artist',identityMatched:true,linkedChannelUrl:channel,checkedAt:new Date(Date.now()-60000).toISOString()}]}
    const save = async (p=profile,expected=null) => db.query('select public.admin_save_artist_channel($1,$2,$3,$4)',[bandId,await version(),expected,p])
    const get = async () => (await db.query('select public.admin_artist_channel($1) as d',[bandId])).rows[0].d
    const manifest = async () => (await db.query('select public.service_artist_channel_manifest() as d')).rows[0].d
    const publicRows = async () => (await db.query('select public.artist_official_profiles() as d')).rows[0].d
    await assert.rejects(save({...profile,musicBrainzId:admin}),/IDENTITY_REQUIRED/)
    await assert.rejects(save({...profile,channelUrl:'https://www.youtube.com/watch?v=x'}),/INVALID_CHANNEL_PROFILE/)
    await assert.rejects(save({...profile,evidence:[]}),/OFFICIAL_EVIDENCE_REQUIRED/)
    await assert.rejects(save({...profile,locked:true}),/LOCKED_ID_REQUIRED/)
    await assert.rejects(save({...profile,evidence:[{...profile.evidence[0],checkedAt:'bad'}]}),/INVALID_EVIDENCE/)
    await assert.rejects(save({...profile,evidence:[{...profile.evidence[0],checkedAt:'2026-99-99T00:00:00Z'}]}),/date\/time field value out of range/)
    await save()
    let stored=await get()
    assert.equal(stored.history.length,1)
    await assert.rejects(save(),/EDIT_CONFLICT/)
    const source=await manifest(), row=source.artists[0]
    const checkedAt=new Date().toISOString()
    const result={...row,runStartedAt:checkedAt,status:'refreshed',reason:'',cache:{channelId:id,title:'Channel',channelUrl:channel,checkedAt,thumbnails:{high:{url:'https://yt3.googleusercontent.com/avatar=s800',width:800,height:800}}}}
    const apply=(value=result,expected=row.profileVersion)=>db.query('select public.service_apply_artist_channel($1,$2)',[value,expected])
    await assert.rejects(apply({...result,cache:{...result.cache,thumbnails:{high:{url:'https://evil.example.com/image'}}}}),/INVALID_CHANNEL_CACHE/)
    await db.exec('set role service_role')
    await apply()
    await assert.rejects(apply({...result,runStartedAt:new Date(Date.now()-60000).toISOString(),status:'failed',cache:null}),/EDIT_CONFLICT/)
    await assert.rejects(db.query('select * from private.artist_channel_cache'),/permission denied/)
    await db.exec('reset role; set role anon')
    let visible=await publicRows()
    assert.equal(visible[0].photo.url,result.cache.thumbnails.high.url)
    assert.equal(visible[0].photo.channelUrl,channel)
    assert.equal(visible[0].website_url,profile.websiteUrl)
    assert.equal(Date.parse(visible[0].photo.expiresAt)-Date.parse(visible[0].photo.checkedAt),29*86400000)
    await assert.rejects(db.query('select public.service_artist_channel_manifest()'),/permission denied/)
    await assert.rejects(db.query('select public.admin_artist_channel($1)',[bandId]),/permission denied/)
    await db.exec('reset role')
    // The background cache never changes manually selected pictures, or stores API metadata in history.
    await db.query("update public.bands set photo_mode='manual',representative_photo=$2 where id=$1",[bandId,{url:'https://images.example.com/manual.png'}])
    assert.equal((await db.query('select photo_mode,representative_photo from public.bands where id=$1',[bandId])).rows[0].representative_photo.url,'https://images.example.com/manual.png')
    await assert.rejects(apply(),/EDIT_CONFLICT/)
    stored=await get()
    assert.equal(stored.history.length,1); assert.ok(!JSON.stringify(stored.history).includes('googleusercontent'))
    // Expired metadata is gated even before cleanup, then physically purged without a provider/key.
    await db.query("update private.artist_channel_cache set expires_at=now()-interval '1 second' where band_id=$1",[bandId])
    assert.equal((await publicRows())[0].photo,null)
    await manifest()
    assert.equal((await db.query('select count(*)::int as n from private.artist_channel_cache')).rows[0].n,0)
    // Locked reviewed IDs cannot be replaced by bulk imports.
    await save({...profile,locked:true,previousChannelId:id},stored.profile.updated_at)
    stored=await get()
    await assert.rejects(db.query('select public.service_save_artist_channel($1,$2,$3,$4)',[bandId,await version(),stored.profile.updated_at,profile]),/CHANNEL_LOCKED/)
    // A changed identity or stale official evidence cannot be publicly displayed.
    await db.query("update private.artist_channels set evidence=jsonb_set(evidence,'{0,checkedAt}',to_jsonb((now()-interval '91 days')::text)) where band_id=$1",[bandId])
    assert.deepEqual(await publicRows(),[])
    await db.query("update public.bands set curation_status='held' where id=$1",[bandId])
    await assert.rejects(save(profile,stored.profile.updated_at),/ARTIST_NOT_AVAILABLE/)
    assert.deepEqual(await publicRows(),[])
    await db.exec("select set_config('test.uid','',false); set role authenticated")
    await assert.rejects(db.query('select public.admin_artist_channel($1)',[bandId]),/ADMIN_REQUIRED/)
    await assert.rejects(db.query('select public.service_apply_artist_channel($1,$2)',[result,row.profileVersion]),/permission denied/)
    // A shared label channel hides both identities and stale concurrent workers cannot republish it.
    await db.exec('reset role')
    await db.query("select set_config('test.uid',$1,false)",[admin])
    await db.query("update public.bands set curation_status='unreviewed' where id=$1",[bandId])
    await save(profile,stored.profile.updated_at)
    const secondMbid='00000000-0000-4000-8000-000000000003'
    const secondId=(await db.query('select public.service_import_artist($1) as id',[{key:`mb:${secondMbid}`,name:'Other Artist',country:'JP',aliases:[],genre:'Unknown',evidence:`https://musicbrainz.org/artist/${secondMbid}`}])).rows[0].id
    const secondVersion=(await db.query("select to_jsonb(b)->>'updated_at' as v from public.bands b where id=$1",[secondId])).rows[0].v
    await db.query('select public.admin_save_artist_channel($1,$2,null,$3)',[secondId,secondVersion,{...profile,musicBrainzId:secondMbid}])
    const pair=(await manifest()).artists
    const first=pair.find(r=>r.bandId===bandId), second=pair.find(r=>r.bandId===secondId)
    const recentResult=source=>({...source,status:'refreshed',reason:'',cache:result.cache,runStartedAt:new Date().toISOString()})
    await db.query('select public.service_apply_artist_channel($1,$2)',[recentResult(first),first.profileVersion])
    await db.query('select public.service_apply_artist_channel($1,$2)',[recentResult(second),second.profileVersion])
    assert.deepEqual(await publicRows(),[])
    assert.equal((await db.query('select count(*)::int as n from private.artist_channel_cache')).rows[0].n,0)
    await assert.rejects(db.query('select public.service_apply_artist_channel($1,$2)',[recentResult(first),first.profileVersion]),/CHANNEL_REVIEW_REQUIRED/)
  } finally { await db.close() }
})

import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
const id='dcb90080-9164-478b-a728-b0f0172e2db0',mbid='4561aee5-6cf6-41a6-9b7b-f7be15a00a65',run='5054d095-437d-429f-8f33-7599d85b6bc3'
const key=n=>`artist-profile-preparation/v1/runs/${run}/bands/${id}/attempts/${n}.json.gz`
const content=()=>({identity:{bandId:id,musicBrainzId:mbid,wikidata:'https://www.wikidata.org/wiki/Q16183546'},bio:'확인된 아티스트의 한국어 소개 요약입니다.',wikipedia:'https://ko.wikipedia.org/wiki/Artist',language:'한국어',bioSource:{revision:1,revisionUrl:'https://ko.wikipedia.org/wiki/Artist?oldid=1',authorsUrl:'https://ko.wikipedia.org/wiki/Artist?action=history',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',checkedAt:new Date().toISOString(),modification:'한국어 요약·수정'},music:[],live:[],channel:''})
test('profile apply is approved-only, identity/CAS fenced, immutable, private and preserves unrelated values',async()=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private;
   create table public.bands(id uuid primary key,musicbrainz_id uuid,updated_at timestamptz,curation_status text,description text,photo_mode text);
   create table public.catalog_signal(id int primary key,revision int);insert into public.catalog_signal values(1,0);
   create function private.is_admin() returns boolean language sql as $$select coalesce(current_setting('test.admin',true),'false')='true'$$;`)
  await db.exec(await readFile(new URL('../supabase/migrations/20261121131430_artist_profile_publication.sql',import.meta.url),'utf8'))
  await db.query("insert into public.bands values($1,$2,now(),'approved','manual description','auto')",[id,mbid])
  const bandVersion=(await db.query("select to_jsonb(b)->>'updated_at' v from public.bands b")).rows[0].v
  const apply=(p=content(),n=1,v=null,bv=bandVersion)=>db.query('select public.service_apply_artist_profile($1,$2,$3,$4,$5) d',[id,bv,v,key(n),p])
  const state=async()=> (await db.query('select public.service_artist_profile_state($1) d',[id])).rows[0].d
  const visible=async()=> (await db.query('select public.artist_profile_content($1) d',[id])).rows[0].d
  await assert.rejects(apply(),/SERVICE_ROLE_REQUIRED/)
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`)
  await assert.rejects(apply({...content(),identity:{...content().identity,musicBrainzId:run}}),/PROFILE_CONTENT_INVALID/)
  await assert.rejects(apply({...content(),banner:{url:'https://shorefire.com/image.jpg'}}),/PROFILE_IMAGE_RIGHTS_REQUIRED/)
  const p=content();await apply(p);let s=await state()
  assert.equal((await visible()).bio,p.bio)
  assert.equal((await apply(p)).rows[0].d.status,'already_applied')
  await assert.rejects(apply({...p,bio:'different value requiring a new immutable attempt'}),/PROFILE_ATTEMPT_CONFLICT/)
  await assert.rejects(apply(p,2),/PROFILE_EDIT_CONFLICT/)
  assert.equal((await db.query('select count(*)::int n from private.artist_profile_applications')).rows[0].n,1)
  await assert.rejects(apply(p,2,s.updated_at,'2000-01-01T00:00:00Z'),/PROFILE_EDIT_CONFLICT/)
  await db.exec("update private.artist_profile_content set locked=true")
  await assert.rejects(apply(p,2,s.updated_at),/PROFILE_MANUAL_LOCK/)
  await db.exec("update private.artist_profile_content set locked=false;update public.bands set curation_status='unreviewed'")
  assert.equal(await visible(),null);await assert.rejects(apply(p,2,s.updated_at),/PROFILE_ARTIST_NOT_APPROVED/)
  await db.exec("update public.bands set curation_status='approved'")
  const video={id:'kq4GcIzcwXc',channelId:'UC3Ea2-Ut3navgOlTfoq790g',title:'33',publisher:'Publisher',checkedAt:new Date().toISOString(),officialityBasis:'Official independent source links exact channel.',evidenceUrls:['https://official.example.com/artist']}
  const banner={url:'https://upload.wikimedia.org/wikipedia/commons/example.jpg',source:'https://commons.wikimedia.org/wiki/File:Example.jpg',author:'Author',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',useScope:'production_commons',restrictions:''}
  await assert.rejects(apply({...p,music:[video],live:[video]},2,s.updated_at),/PROFILE_VIDEO_INVALID/)
  await apply({...p,music:[video],banner},2,s.updated_at)
  await db.exec("update public.bands set photo_mode='manual'")
  assert.equal((await visible()).banner,undefined)
  assert.equal((await db.query('select description from public.bands')).rows[0].description,'manual description')
  await db.exec("update private.artist_profile_content set content=jsonb_set(content,'{music,0,checkedAt}',to_jsonb((now()-interval '8 days')::text))")
  assert.deepEqual((await visible()).music,[])
  await db.exec("set role anon")
  assert.equal((await visible()).identity.bandId,id)
  await assert.rejects(state(),/permission denied/)
  await assert.rejects(apply(),/permission denied/)
  await assert.rejects(db.query('select * from private.artist_profile_applications'),/permission denied/)
  await db.exec('reset role;update public.bands set updated_at=now()')
  assert.equal(await visible(),null)
 }finally{await db.close()}
})

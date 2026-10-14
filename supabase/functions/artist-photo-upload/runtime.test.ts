import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { PNG } from 'npm:pngjs@7.0.0'
import { createArtistPhotoUploadHandler } from '../_shared/artist-photo-upload.mjs'

Deno.test('Deno multipart upload decodes, normalizes and saves PNG with caller-scoped metadata', async () => {
  let saved = false
  const handler = createArtistPhotoUploadHandler({
    authorize: async () => ({user:'admin',admin:true}),
    normalizePng: (bytes:Uint8Array) => PNG.sync.write(PNG.sync.read(Buffer.from(bytes))),
    upload: async (_path:string, bytes:Uint8Array) => { assert.equal(PNG.sync.read(Buffer.from(bytes)).width,2); return 'https://test.supabase.co/photo.png' },
    save: async (token:string, metadata:{version:string}, url:string) => {assert.equal(token,'admin');assert.equal(metadata.version,'2026-10-14T10:00:00.123456Z');assert.ok(url.endsWith('.png'));saved=true;return {error:null}},
    remove: async () => { throw new Error('Unexpected cleanup') },
  })
  const body=new FormData()
  body.set('file',new Blob([PNG.sync.write(new PNG({width:2,height:2}))],{type:'image/png'}),'photo.png')
  body.set('metadata',JSON.stringify({bandId:'00000000-0000-4000-8000-000000000001',version:'2026-10-14T10:00:00.123456Z',aliases:[],photo:{source:'https://official.example.com/photo',author:'Author',license:'Permission',licenseUrl:'https://official.example.com/terms',usageBasis:'Display'}}))
  const response=await handler(new Request('https://example.com/upload',{method:'POST',body,headers:{Authorization:'Bearer admin'}}))
  assert.equal(response.status,200)
  assert.equal(saved,true)
})

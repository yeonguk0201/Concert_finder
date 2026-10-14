import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { createArtistPhotoUploadHandler, validatePngHeader, MAX_PHOTO_BYTES } from '../supabase/functions/_shared/artist-photo-upload.mjs'
const id = '00000000-0000-4000-8000-000000000001'
const metadata = { bandId: id, version: '2026-10-14T10:00:00.123456Z', aliases: ['아도'], photo: { source: 'https://artist.example.com/photo', author: 'Author', license: 'Permission', licenseUrl: 'https://artist.example.com/terms', usageBasis: 'Display, crop, resize and host' } }
const png = () => PNG.sync.write(new PNG({ width: 2, height: 2 }))
const request = (bytes = png(), meta = metadata, token = true) => {
  const body = new FormData()
  body.set('file', new Blob([bytes], { type: 'image/png' }), 'photo.png')
  body.set('metadata', JSON.stringify(meta))
  return new Request('https://example.com/upload', { method: 'POST', body, headers: token ? { Authorization: 'Bearer user' } : {} })
}
const setup = (overrides = {}) => {
  const calls = { uploads: [], saves: [], removed: [], logs: [] }
  const handler = createArtistPhotoUploadHandler({
    authorize: async () => ({ user: 'admin', admin: true }),
    normalizePng: bytes => PNG.sync.write(PNG.sync.read(Buffer.from(bytes))),
    upload: async (path, bytes) => { calls.uploads.push({ path, bytes }); return `https://project.supabase.co/storage/v1/object/public/artist-photos/${path}` },
    save: async (...args) => { calls.saves.push(args); return { error: null } },
    remove: async path => { calls.removed.push(path) },
    log: (...args) => calls.logs.push(args), ...overrides,
  })
  return { handler, calls }
}
test('upload authenticates and authorizes before parsing or writing', async () => {
  for (const [access, status] of [[null,401],[{user:'user',admin:false},403]]) {
    const {handler,calls}=setup({authorize:async()=>access})
    assert.equal((await handler(request())).status,status)
    assert.equal(calls.uploads.length,0)
  }
  const {handler}=setup()
  assert.equal((await handler(request(png(),metadata,false))).status,401)
  assert.equal((await handler(new Request('https://example.com',{method:'OPTIONS'}))).status,204)
})
test('rights, malformed PNG, CRC and oversized/dangerous dimensions are rejected before storage', async () => {
  const {handler,calls}=setup()
  const corrupted = png(); corrupted[29] ^= 255
  for (const [bytes,meta,error] of [
    [png(),{...metadata,photo:{...metadata.photo,usageBasis:''}},'PHOTO_RIGHTS_REQUIRED'],
    [new Uint8Array(40),metadata,'PHOTO_FILE_INVALID'],
    [corrupted,metadata,'PHOTO_FILE_INVALID'],
  ]) assert.equal((await (await handler(request(bytes,meta))).json()).error,error)
  const oversized = new Request('https://example.com/upload', { method:'POST', body:new Uint8Array(MAX_PHOTO_BYTES+40000), headers:{Authorization:'Bearer user','Content-Type':'multipart/form-data; boundary=test'} })
  assert.equal((await (await handler(oversized)).json()).error,'PHOTO_FILE_SIZE')
  const bomb=png(); bomb.writeUInt32BE(100000,16)
  assert.throws(()=>validatePngHeader(bomb),/PHOTO_FILE_DIMENSIONS/)
  assert.equal(calls.uploads.length,0)
})
test('valid upload commits caller version and rights to RPC with a new immutable URL on replacement', async () => {
  const {handler,calls}=setup()
  assert.equal((await handler(request())).status,200)
  assert.equal((await handler(request())).status,200)
  assert.notEqual(calls.uploads[0].path,calls.uploads[1].path)
  assert.ok(calls.uploads[0].path.startsWith(`${id}/`))
  assert.equal(calls.saves[0][0],'user')
  assert.equal(calls.saves[0][1].version,metadata.version)
  assert.deepEqual(calls.saves[0][1].photo,metadata.photo)
  assert.equal(calls.removed.length,0)
})
test('definite conflict cleans only the new object; lost responses never delete a possibly committed image', async () => {
  const conflict=setup({save:async()=>({error:{code:'P0001',message:'EDIT_CONFLICT'}})})
  assert.equal((await conflict.handler(request())).status,409)
  assert.deepEqual(conflict.calls.removed,[conflict.calls.uploads[0].path])
  for (const save of [async()=>{throw new Error('network')},async()=>({error:{message:'Failed to fetch',code:''}})]) {
    const lost=setup({save})
    assert.equal((await (await lost.handler(request())).json()).error,'PHOTO_SAVE_UNCERTAIN')
    assert.equal(lost.calls.removed.length,0)
  }
})

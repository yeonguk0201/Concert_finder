export const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const reply = (status, value) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

export function validatePhotoMetadata(metadata) {
  if (!metadata || !uuid.test(metadata.bandId) || typeof metadata.version !== 'string' || !Number.isFinite(Date.parse(metadata.version)) || !Array.isArray(metadata.aliases) || metadata.aliases.length > 100 || metadata.aliases.some(a => typeof a !== 'string' || !a.trim() || a.length > 200)) throw new Error('INVALID_ARTIST')
  const photo = metadata.photo
  if (!photo || typeof photo !== 'object') throw new Error('PHOTO_RIGHTS_REQUIRED')
  for (const field of ['source', 'licenseUrl']) {
    if (typeof photo[field] !== 'string' || photo[field].length > 2000 || !/^https:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/[^\s]*)?$/i.test(photo[field])) throw new Error('INVALID_PHOTO_URL')
  }
  for (const field of ['author', 'license', 'usageBasis']) if (typeof photo[field] !== 'string' || !photo[field].trim() || photo[field].length > 2000) throw new Error('PHOTO_RIGHTS_REQUIRED')
  if (photo.credit != null && (typeof photo.credit !== 'string' || photo.credit.length > 2000)) throw new Error('PHOTO_RIGHTS_REQUIRED')
  return metadata
}

// Bound dimensions BEFORE invoking the PNG decoder to prevent decompression bombs.
export function validatePngHeader(bytes) {
  if (bytes.length < 33 || bytes.length > MAX_PHOTO_BYTES) throw new Error('PHOTO_FILE_SIZE')
  if (![137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n) || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') throw new Error('PHOTO_FILE_INVALID')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16), height = view.getUint32(20)
  if (!width || !height || width > 1024 || height > 1024 || bytes[24] !== 8 || ![2,6].includes(bytes[25]) || bytes[28] !== 0) throw new Error('PHOTO_FILE_DIMENSIONS')
}

export function createArtistPhotoUploadHandler({ authorize, normalizePng, upload, save, remove, randomId = () => crypto.randomUUID(), log = (..._args) => {} }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return reply(405, { error: 'METHOD_NOT_ALLOWED' })
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
    if (!token) return reply(401, { error: 'AUTH_REQUIRED' })
    let access
    try { access = await authorize(token) } catch { return reply(503, { error: 'PHOTO_UPLOAD_FAILED' }) }
    if (!access?.user) return reply(401, { error: 'AUTH_REQUIRED' })
    if (!access.admin) return reply(403, { error: 'ADMIN_REQUIRED' })
    // Stream a bounded request; never buffer an unbounded multipart body.
    let size = 0
    const chunks = []
    try {
      const reader = request.body?.getReader()
      if (!reader) return reply(400, { error: 'PHOTO_FILE_INVALID' })
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > MAX_PHOTO_BYTES + 32768) { await reader.cancel(); return reply(413, { error: 'PHOTO_FILE_SIZE' }) }
        chunks.push(value)
      }
      const form = await new Response(new Blob(chunks), { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData()
      const metadataText = form.get('metadata')
      if (typeof metadataText !== 'string' || metadataText.length > 30000) throw new Error('INVALID_ARTIST')
      let metadata
      try { metadata = JSON.parse(metadataText) } catch { throw new Error('INVALID_ARTIST') }
      validatePhotoMetadata(metadata)
      const file = form.get('file')
      if (!file || typeof file === 'string' || file.type !== 'image/png') throw new Error('PHOTO_FILE_TYPE')
      const bytes = new Uint8Array(await file.arrayBuffer())
      validatePngHeader(bytes)
      let normalized
      try { normalized = await normalizePng(bytes) } catch { throw new Error('PHOTO_FILE_INVALID') }
      if (!normalized.length || normalized.length > MAX_PHOTO_BYTES) throw new Error('PHOTO_FILE_SIZE')
      const path = `${metadata.bandId}/${randomId()}.png`
      const url = await upload(path, normalized)
      // RPC runs with the caller's JWT: it rechecks admin, version, identity and rights.
      // A returned DB rejection is definite; a lost response may already have committed.
      let result
      try { result = await save(token, metadata, url) } catch { throw new Error('PHOTO_SAVE_UNCERTAIN') }
      if (result.error) {
        if (!/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(result.error.code ?? '')) {
          log('PHOTO_SAVE_UNCERTAIN', path)
          throw new Error('PHOTO_SAVE_UNCERTAIN')
        }
        try { await remove(path) } catch { log('PHOTO_ORPHAN', path) }
        throw new Error(result.error.message?.includes('EDIT_CONFLICT') ? 'EDIT_CONFLICT' : result.error.message?.includes('ADMIN_REQUIRED') ? 'ADMIN_REQUIRED' : 'PHOTO_UPLOAD_FAILED')
      }
      return reply(200, { saved: true })
    } catch (error) {
      const known = ['INVALID_ARTIST','INVALID_PHOTO_URL','PHOTO_RIGHTS_REQUIRED','PHOTO_FILE_TYPE','PHOTO_FILE_SIZE','PHOTO_FILE_INVALID','PHOTO_FILE_DIMENSIONS','EDIT_CONFLICT','ADMIN_REQUIRED','PHOTO_UPLOAD_FAILED','PHOTO_SAVE_UNCERTAIN']
      const code = known.includes(error?.message) ? error.message : 'PHOTO_UPLOAD_FAILED'
      return reply(code === 'EDIT_CONFLICT' ? 409 : code === 'ADMIN_REQUIRED' ? 403 : ['PHOTO_UPLOAD_FAILED','PHOTO_SAVE_UNCERTAIN'].includes(code) ? 503 : 400, { error: code })
    }
  }
}

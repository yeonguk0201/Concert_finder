import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { PNG } from 'npm:pngjs@7.0.0'
import { Buffer } from 'node:buffer'
import { createArtistPhotoUploadHandler } from '../_shared/artist-photo-upload.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
const caller = (token: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
const bucket = service.storage.from('artist-photos')
Deno.serve(createArtistPhotoUploadHandler({
  authorize: async (token: string) => {
    const client = caller(token)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) return null
    const access = await client.rpc('is_catalog_admin')
    if (access.error) throw access.error
    return { user: data.user.id, admin: access.data === true }
  },
  normalizePng: (bytes: Uint8Array) => PNG.sync.write(PNG.sync.read(Buffer.from(bytes), { checkCRC: true })),
  upload: async (path: string, bytes: Uint8Array) => {
    const { error } = await bucket.upload(path, bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false })
    if (error) throw error
    return bucket.getPublicUrl(path).data.publicUrl
  },
  save: (token: string, metadata: { bandId: string; version: string; aliases: string[]; photo: Record<string, unknown> }, photoUrl: string) => caller(token).rpc('admin_update_artist', {
    band_id: metadata.bandId, expected_updated_at: metadata.version, aliases: metadata.aliases, mode: 'manual', photo: { ...metadata.photo, url: photoUrl },
  }),
  remove: async (path: string) => { const { error } = await bucket.remove([path]); if (error) throw error },
  log: (code: string, path: string) => console.warn(code, path),
}))

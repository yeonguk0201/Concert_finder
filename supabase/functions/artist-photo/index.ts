import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createArtistPhotoHandler } from '../_shared/artist-photo.mjs'
const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createArtistPhotoHandler({
  cache: async (action: string, term: string, value: unknown = null) => {
    const { data, error } = await service.rpc('service_artist_search_cache', { action, term, value })
    if (error) throw error
    return data
  },
  resolveBand: async (band: string) => {
    const { data, error } = await service.rpc('service_artist_photo_identity', { band })
    if (error) throw error
    return data
  },
}))

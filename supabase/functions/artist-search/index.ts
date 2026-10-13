import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createArtistSearchHandler } from '../_shared/artist-search.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createArtistSearchHandler({
  authenticateUser: async (token: string) => {
    const { data, error } = await service.auth.getUser(token)
    return !error && Boolean(data.user)
  },
  cache: async (action: string, term: string, value: unknown = null) => {
    const { data, error } = await service.rpc('service_artist_search_cache', { action, term, value })
    if (error) throw error
    return data
  },
  importArtist: async (identity: unknown) => {
    const { data, error } = await service.rpc('service_import_artist', { identity })
    if (error) throw error
    return data
  },
  loadBand: async (id: string) => {
    const { data, error } = await service.from('bands').select('id,name,aliases,country_code,description,musicbrainz_id,representative_photo,photo_mode,category,curation_status').eq('id', id).in('curation_status', ['unreviewed', 'approved']).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('ARTIST_NOT_AVAILABLE')
    return data
  },
}))

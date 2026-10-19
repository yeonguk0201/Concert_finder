import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createArtistSearchHandler } from '../_shared/artist-search.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createArtistSearchHandler({
  authorize: async (token: string) => {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await caller.auth.getUser(token)
    if (error || !data.user) return null
    const access = await caller.rpc('is_catalog_admin')
    if (access.error) throw access.error
    return { admin: access.data === true }
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

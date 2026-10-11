import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createArtistSearchHandler } from '../_shared/artist-search.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } })
Deno.serve(createArtistSearchHandler({
  authenticateAdmin: async (token: string) => {
    const { data, error } = await service.auth.getUser(token)
    if (error || !data.user) return false
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const access = await caller.rpc('is_catalog_admin')
    return !access.error && access.data === true
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
}))

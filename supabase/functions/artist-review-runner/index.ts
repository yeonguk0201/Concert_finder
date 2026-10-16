import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createArtistReviewHandler } from '../_shared/artist-review-runner.mjs'

const server = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
Deno.serve(createArtistReviewHandler({
  secret: Deno.env.get('ARTIST_REVIEW_RUNNER_SECRET'),
  youtubeKey: Deno.env.get('YOUTUBE_API_KEY'),
  rpc: (name: string, args: Record<string, unknown>) => server.rpc(name, args),
}))

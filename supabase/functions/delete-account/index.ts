import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import { createAccountDeletionHandler } from '../_shared/account-deletion.mjs'

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
Deno.serve(createAccountDeletionHandler({
  authenticate: async (token: string) => {
    const { data, error } = await client.auth.getUser(token)
    return error ? null : data.user
  },
  deleteUser: async (id: string) => {
    const { error } = await client.auth.admin.deleteUser(id, false)
    if (error) throw new Error('DELETE_FAILED')
  },
}))

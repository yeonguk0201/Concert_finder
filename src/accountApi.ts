import { backend } from './backend'
import { requestAuthCheck } from './authEvents'

export type Collection = 'bands' | 'schedules'
export async function readAccount(userId: string) {
  if (!backend) throw new Error('No backend')
  const [follows, schedules] = await Promise.all([
    backend.from('band_follows').select('band_id').eq('user_id', userId),
    backend.from('saved_schedules').select('ticket_schedule_id').eq('user_id', userId),
  ])
  if (follows.error || schedules.error) throw new Error('Account read failed')
  return { bands: follows.data.map(r => r.band_id as string), schedules: schedules.data.map(r => r.ticket_schedule_id as string) }
}
export async function writeAccount(userId: string, collection: Collection, id: string, add: boolean) {
  if (!backend) throw new Error('No backend')
  const table = collection === 'bands' ? 'band_follows' : 'saved_schedules'
  const column = collection === 'bands' ? 'band_id' : 'ticket_schedule_id'
  const query = add
    ? backend.from(table).upsert({ user_id: userId, [column]: id }, { onConflict: `user_id,${column}`, ignoreDuplicates: true })
    : backend.from(table).delete().eq('user_id', userId).eq(column, id)
  const { error } = await query
  if (error) { requestAuthCheck(error.code); throw new Error('Account write failed') }
}

import { backend } from './backend'

export type AdminBand = { id: string; name: string; country_code: string; aliases: string[] }
export type Source = { url: string; label: string; verified_at: string | null }
export type SessionRow = { label: string; starts_on: string | null; starts_at: string | null }
export type AdminConcert = {
  id?: string; updated_at?: string; first_published_at?: string | null
  title: string; format: 'solo' | 'festival'; city: string | null; venue: string | null
  starts_on: string | null; ends_on: string | null; announced_on: string | null; announced_at: string | null
  announcement_verified: boolean; cancelled: boolean; status: 'draft' | 'review' | 'published' | 'withdrawn'
  sources: Source[]; band_ids: string[]; sessions: SessionRow[]
  ticket: { id?: string; revision?: number; opens_at: string | null; booking_url: string | null; price_description: string | null } | null
}
export type CatalogHistory = { id: string; concert_id: string; changed_at: string; before_record: AdminConcert | null; after_record: AdminConcert }
export type AdminCatalog = { concerts: AdminConcert[]; bands: AdminBand[]; history: CatalogHistory[] }

export const emptyConcert = (): AdminConcert => ({ title: '', format: 'solo', city: '', venue: '', starts_on: null, ends_on: null, announced_on: null, announced_at: null, announcement_verified: false, cancelled: false, status: 'draft', sources: [], band_ids: [], sessions: [], ticket: { opens_at: null, booking_url: null, price_description: null } })

export function adminError(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  if (message.includes('EDIT_CONFLICT')) return '다른 관리자가 수정했습니다. 목록을 다시 불러온 뒤 변경 내용을 확인해 주세요.'
  if (message.includes('ADMIN_REQUIRED')) return '관리자 권한이 필요합니다.'
  if (message.includes('CONCERT_NOT_FOUND')) return '공연이 삭제되었습니다. 목록을 다시 불러와 주세요.'
  if (message.includes('Publication requires')) return '공개하려면 공연일·확인된 발표일·공식 출처·출연 밴드가 필요합니다.'
  return '저장 또는 조회에 실패했습니다. 입력과 연결을 확인하고 다시 시도해 주세요.'
}

export async function loadAdminCatalog(): Promise<AdminCatalog> {
  if (!backend) throw new Error('backend')
  const { data, error } = await backend.rpc('admin_catalog')
  if (error) throw error
  return data as AdminCatalog
}
export async function saveAdminConcert(concert: AdminConcert) {
  if (!backend) throw new Error('backend')
  const { data, error } = await backend.rpc('admin_save_concert', { payload: concert, expected_updated_at: concert.updated_at ?? null })
  if (error) throw error
  return data as string
}
export async function saveAdminBand(name: string, country: string, aliases: string[]) {
  if (!backend) throw new Error('backend')
  const { error } = await backend.rpc('admin_save_band', { band_name: name, country, aliases })
  if (error) throw error
}

// datetime-local is displayed in KST regardless of the browser's own timezone.
export function kstInput(value: string | null | undefined) {
  if (!value) return ''
  return new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 16)
}
export function kstTimestamp(value: string) { return value ? new Date(`${value}:00+09:00`).toISOString() : null }

export function announcementDateError(concert: Pick<AdminConcert, 'announced_on' | 'announced_at'>) {
  if (!concert.announced_at) return ''
  if (!concert.announced_on) return '발표 시각을 입력하려면 공식 발표일도 입력해 주세요. 시각이 미확인이면 비워 두세요.'
  const date = kstInput(concert.announced_at).slice(0, 10)
  return date === concert.announced_on ? '' : `공식 발표일(${concert.announced_on})과 발표 시각의 날짜(${date})가 다릅니다. 같은 날짜로 맞추거나 미확인 시각을 비워 주세요.`
}

import { backend } from './backend'

export type ArtistStatus = 'unreviewed' | 'approved' | 'held' | 'excluded'
export type ArtistCategory = 'unclassified' | 'domestic_rock' | 'overseas_rock' | 'jpop'
export const artistStatusLabels: Record<ArtistStatus, string> = { unreviewed: '미검수', approved: '승인', held: '보류', excluded: '제외' }
export const artistCategoryLabels: Record<ArtistCategory, string> = { unclassified: '미분류', domestic_rock: '국내 록', overseas_rock: '해외 록', jpop: 'J-pop' }
export type AdminBand = { id: string; name: string; country_code: string; aliases: string[]; category?: ArtistCategory; curation_status?: ArtistStatus; curation_reason?: string; curation_evidence_url?: string | null; musicbrainz_id?: string | null; updated_at?: string; representative_photo?: import('./artistPhotoTypes').ArtistPhotoData | null; photo_mode?: 'auto' | 'manual' | 'hidden' }
export type ArtistHistory = { id: string; actor_id: string | null; changed_at: string; before_record: Partial<AdminBand>; after_record: AdminBand }
export type Source = { url: string; label: string; verified_at: string | null }
export type SessionRow = { label: string; starts_on: string | null; starts_at: string | null }
export type Artwork = { url: string; source_url: string; selection_reason: string; display_approved: boolean; checked_at?: string }
export type AdminConcert = {
  discovered_artists?: { name: string | null; source_url: string; profile_url?: string | null; key?: string | null; band_id?: string | null; reason?: string; matches?: { key: string; name: string; country: string | null; evidence: string; disambiguation: string }[] }[]
  artwork?: Artwork | null; review_reasons?: string[]
  id?: string; updated_at?: string; first_published_at?: string | null
  title: string; format: 'solo' | 'festival'; city: string | null; venue: string | null
  starts_on: string | null; ends_on: string | null; announced_on: string | null; announced_at: string | null
  announcement_verified: boolean; cancelled: boolean; initial_import?: boolean; status: 'draft' | 'review' | 'published' | 'withdrawn'
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
  if (message.includes('ARTIST_NOT_FOUND')) return '아티스트를 찾을 수 없습니다. 목록을 다시 불러와 주세요.'
  if (message.includes('ARTIST_NOT_AVAILABLE')) return '보류·제외한 아티스트입니다. DB 관리에서 상태를 검토하고 복구해 주세요.'
  if (message.includes('APPROVAL_EVIDENCE_REQUIRED')) return '승인하려면 대상 분류와 공식 근거 URL이 필요합니다.'
  if (message.includes('IDENTITY_REQUIRED')) return '승인하기 전에 외부 고유 ID로 아티스트 신원을 확인해 주세요.'
  if (message.includes('OFFICIAL_EVIDENCE_REQUIRED')) return '최근 90일 안에 확인한 공식 페이지의 아티스트 신원·채널 연결 근거가 필요합니다.'
  if (message.includes('LOCKED_ID_REQUIRED')) return '고정할 채널 ID와 /channel/UC… 형식의 채널 URL이 일치해야 합니다.'
  if (message.includes('CHANNEL_LOCKED')) return '관리자가 고정한 채널입니다. 관리자 화면에서 검수 후 변경해 주세요.'
  if (message.includes('INVALID_CHANNEL_PROFILE')) return 'YouTube 채널 주소와 검수 상태를 확인해 주세요. 동영상 주소는 사용할 수 없습니다.'
  if (message.includes('PHOTO_FILE_TYPE')) return 'JPEG·PNG·WebP 이미지 파일을 선택해 주세요.'
  if (message.includes('PHOTO_FILE_SIZE')) return '사진은 비어 있지 않은 최대 2MiB 파일이어야 합니다. 크기를 줄여 다시 선택해 주세요.'
  if (message.includes('PHOTO_FILE_DIMENSIONS')) return '이미지 크기가 허용 범위를 초과했습니다. 원본을 줄여 다시 선택해 주세요.'
  if (message.includes('PHOTO_FILE_INVALID')) return '이미지를 읽을 수 없습니다. 정상 이미지 파일을 다시 선택해 주세요.'
  if (message.includes('PHOTO_RIGHTS_REQUIRED')) return '사진 저작자·라이선스·사용 근거를 입력해 주세요.'
  if (message.includes('INVALID_PHOTO_URL')) return '사진과 이용 근거는 유효한 HTTPS URL로 입력해 주세요.'
  if (message.includes('PHOTO_SAVE_UNCERTAIN')) return '저장 응답을 확인하지 못했습니다. 목록을 다시 불러와 반영 여부를 확인한 뒤 다시 시도해 주세요.'
  if (message.includes('PHOTO_UPLOAD_FAILED')) return '사진 업로드·저장에 실패했습니다. 입력을 유지했습니다. 연결과 저장소 설정을 확인하고 다시 시도해 주세요.'
  if (message.includes('INVALID_ARTIST')) return '이름·국가 코드·별칭·변경 이유를 확인해 주세요.'
  if (message.includes('INVALID_EVIDENCE')) return '공식 근거는 HTTPS URL로 입력해 주세요.'
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

import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { backend } from './backend'

type Artist = { key: string; name: string; country: string | null; aliases: string[]; evidence: string; disambiguation: string; type: string }
export function ArtistLookup({ onImported }: { onImported: () => void }) {
  const [query, setQuery] = useState('')
  const [artists, setArtists] = useState<Artist[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const active = useRef(true), pending = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const invoke = async (body: { action: string; query?: string; id?: string }) => {
    if (!backend) throw new Error('BACKEND_REQUIRED')
    const response = await backend.functions.invoke('artist-search', { body })
    if (response.error) {
      let code = ''
      try { code = (await response.error.context.json()).error } catch { /* Deployment or network failure. */ }
      throw new Error(code)
    }
    return response.data
  }
  const run = async (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setMessage('')
    try { await action() } catch (e) {
      if (active.current) {
        const code = e instanceof Error ? e.message : ''
        setError(code === 'ARTIST_NOT_AVAILABLE' ? '보류·제외한 아티스트입니다. DB 관리에서 상태를 검토하고 복구하세요.' : code === 'IDENTITY_CONFLICT' ? '같은 이름의 기존 아티스트와 신원이 충돌합니다. 공식 식별 정보를 확인하세요.' : code === 'COUNTRY_REQUIRED' ? '아티스트 국적을 확인할 수 없어 등록을 보류했습니다.' : code === 'SEARCH_BUSY' ? '다른 검색을 처리 중입니다. 잠시 후 다시 검색하세요.' : code === 'ADMIN_REQUIRED' ? '관리자 권한이 필요합니다.' : code === 'ARTIST_PROVIDER_UNAVAILABLE' ? '아티스트 검색 제공처가 혼잡합니다. 잠시 후 다시 시도하세요.' : '외부 검색을 사용할 수 없습니다. artist-search 함수 배포와 연결을 확인하세요.')
      }
    } finally { pending.current = false; if (active.current) setBusy(false) }
  }
  const search = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      const data = await invoke({ action: 'search', query: query.trim() })
      if (!active.current) return
      setArtists(data.artists); setMessage(`외부 아티스트 ${data.artists.length}개 결과. 같은 이름은 국적과 소개로 구분하세요.`)
    })
  }
  const add = (artist: Artist) => void run(async () => {
    await invoke({ action: 'import', id: artist.key.slice(3) })
    if (!active.current) return
    setMessage(`${artist.name} 아티스트를 가져왔습니다. DB 관리에서 분류와 노출 상태를 검수하세요.`)
    onImported()
  })
  return <section aria-label="외부 아티스트 검색" className="artist-lookup">
    <h2>아티스트 검색·가져오기</h2><p>MusicBrainz에서 이름·별칭으로 찾습니다. 검색만으로 등록되지 않으며, 선택한 아티스트의 고유 ID로 중복을 확인합니다.</p>
    <form onSubmit={search}><label>외부 아티스트 이름<input required minLength={2} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} /></label><button className="outline" disabled={busy}>{busy ? '처리 중…' : '외부 아티스트 검색'}</button></form>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <ul>{artists.map(artist => <li key={artist.key}><strong>{artist.name}</strong> ({artist.country ?? '국적 미확인'}) · {artist.type} {artist.disambiguation}<p>{artist.aliases.slice(0, 8).join(', ')}</p><a href={artist.evidence} target="_blank" rel="noopener noreferrer">아티스트 정보 ↗</a> <button type="button" className="outline" disabled={busy || !artist.country} onClick={() => add(artist)}>이 아티스트 가져오기</button>{!artist.country && <p>국적을 확인할 수 없어 자동 등록을 보류합니다.</p>}</li>)}</ul>
  </section>
}

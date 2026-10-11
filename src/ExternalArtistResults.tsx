import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { backend } from './backend'
import type { BandRow } from './catalog'

type Artist = { key: string; name: string; country: string | null; aliases: string[]; evidence: string; disambiguation: string; type: string }

async function invoke(body: { action: string; query?: string; id?: string }) {
  if (!backend) throw new Error('BACKEND_REQUIRED')
  const result = await backend.functions.invoke('artist-search', { body })
  if (result.error) {
    let code = ''
    try { code = (await result.error.context.json()).error } catch { /* Network failure. */ }
    throw new Error(code)
  }
  return result.data
}

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  if (code === 'LOGIN_REQUIRED') return '아티스트를 등록하고 찜하려면 로그인해 주세요.'
  if (code === 'IDENTITY_CONFLICT') return '기존 아티스트와 신원을 확인해야 합니다. 다른 대상을 잘못 연결하지 않도록 등록을 보류했습니다.'
  if (code === 'COUNTRY_REQUIRED') return '국적을 확인할 수 없어 등록을 보류했습니다.'
  if (code === 'SEARCH_BUSY') return '다른 검색을 처리 중입니다. 잠시 후 다시 시도해 주세요.'
  if (code === 'SAVE_FAILED') return '아티스트는 등록됐지만 찜을 저장하지 못했습니다. 다시 시도해 주세요.'
  return '외부 아티스트 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

export function ExternalArtistResults({ query, userId, disabled, onLogin, onSelected }: {
  query: string; userId: string | null; disabled: boolean; onLogin: () => void;
  onSelected: (band: BandRow) => Promise<void>;
}) {
  const term = query.trim()
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<{ term: string; artists: Artist[]; loading: boolean; error: string }>({ term: '', artists: [], loading: false, error: '' })
  const [selection, setSelection] = useState<{ key: string; error: string; saved: string[] }>({ key: '', error: '', saved: [] })
  const pending = useRef(false)
  const scope = useRef({ term, userId })
  // Cancel UI updates and account writes when search or account changes.
  useLayoutEffect(() => { const current = { term, userId }; scope.current = current; return () => { if (scope.current === current) scope.current = { term: '', userId: null } } }, [term, userId])
  useEffect(() => {
    if (term.length < 2 || term.length > 100) return
    let active = true
    const timer = setTimeout(() => {
      setState({ term, artists: [], loading: true, error: '' })
      void invoke({ action: 'search', query: term }).then(data => {
        if (active) setState({ term, artists: data.artists, loading: false, error: '' })
      }).catch(error => { if (active) setState({ term, artists: [], loading: false, error: errorMessage(error) }) })
    }, 600)
    return () => { active = false; clearTimeout(timer) }
  }, [term, revision])

  const select = async (artist: Artist) => {
    if (!userId) { onLogin(); return }
    if (pending.current) return
    const current = scope.current
    pending.current = true
    setSelection(s => ({ ...s, key: artist.key, error: '' }))
    try {
      const data = await invoke({ action: 'import', id: artist.key.slice(3) })
      if (scope.current !== current) return
      await onSelected(data.band)
      if (scope.current === current) setSelection(s => ({ ...s, saved: [...new Set([...s.saved, `${userId}:${artist.key}`])] }))
    } catch (error) {
      if (scope.current === current) setSelection(s => ({ ...s, error: errorMessage(error) }))
    } finally {
      pending.current = false
      setSelection(s => ({ ...s, key: '' }))
    }
  }

  return <section aria-label="외부 아티스트 검색 결과" className="external-artists">
    <div className="section-heading"><h2>외부 아티스트</h2></div>
    <p>MusicBrainz에서 이름·별칭으로 찾습니다. 국적과 소개를 확인해 선택하면 고유 ID로 등록하고, 공연이 없어도 찜할 수 있습니다.</p>
    {term.length < 2 ? <p>두 글자 이상 입력해 주세요.</p> : term.length > 100 ? <p>검색어는 100자 이내로 입력해 주세요.</p> : state.term !== term || state.loading ? <p role="status">외부 아티스트 검색 중…</p> : <>
      {state.error ? <p role="alert">{state.error} <button className="outline" onClick={() => setRevision(r => r + 1)}>다시 검색</button></p> : !state.artists.length && <p role="status">일치하는 외부 아티스트가 없습니다. 원어 이름이나 다른 별칭으로 검색해 보세요.</p>}
      <div className="external-artist-grid">{state.artists.map(artist => {
        const saved = selection.saved.includes(`${userId}:${artist.key}`)
        return <article key={artist.key} className="external-artist-card">
          <h3>{artist.name}</h3><p>{artist.country ?? '국적 미확인'} · {artist.type || '유형 미확인'}</p>
          {artist.disambiguation && <p>{artist.disambiguation}</p>}
          {artist.aliases.length > 0 && <p className="artist-aliases">{artist.aliases.slice(0, 8).join(', ')}</p>}
          <a href={artist.evidence} target="_blank" rel="noopener noreferrer">아티스트 정보 ↗</a>
          <button className="outline" disabled={disabled || Boolean(selection.key) || saved || !artist.country} onClick={() => void select(artist)} aria-label={`${artist.name} (${artist.country ?? '국적 미확인'}${artist.disambiguation ? ` · ${artist.disambiguation}` : ''}) 등록하고 찜하기`}>{selection.key === artist.key ? '저장 중…' : saved ? '찜 완료' : '선택하고 찜하기'}</button>
          {!artist.country && <p>국적 확인 후 등록할 수 있습니다.</p>}
        </article>
      })}</div>
    </>}
    {selection.error && <p role="alert">{selection.error}</p>}
  </section>
}

import { useEffect, useRef, useState } from 'react'
import { backend } from './backend'

type Photo = { url: string; source: string; author: string; credit: string; license: string; licenseUrl: string; identity: string; wikidata: string; retrievedAt: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const cache = new Map<string, { photo: Photo | null; expires: number }>()
const pending = new Map<string, { promise: Promise<Photo | null>; wanted: Set<() => boolean> }>()
let queue: Promise<unknown> = Promise.resolve()
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function validPhoto(photo: Photo) {
  return /^https:\/\/(?:upload|thumb)\.wikimedia\.org\/wikipedia\/commons\//.test(photo.url)
    && /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(photo.source)
    && /^https:\/\/creativecommons\.org\//.test(photo.licenseUrl) && Boolean(photo.author && photo.license)
}

function loadArtistPhoto(key: string, body: { id?: string; band_id?: string }, isWanted: () => boolean = () => true): Promise<Photo | null> {
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.photo)
  const running = pending.get(key)
  if (running) { running.wanted.add(isWanted); return running.promise }
  const wanted = new Set([isWanted])
  const task = queue.catch(() => {}).then(async () => {
    if (!backend || ![...wanted].some(check => check())) return null
    // Names and follow controls render first; serialize optional photo work.
    await delay(1100)
    if (![...wanted].some(check => check())) return null
    for (let attempt = 0; attempt < 2; attempt++) {
      if (![...wanted].some(check => check())) return null
      const response = await backend.functions.invoke('artist-photo', { body })
      if (response.error) {
        let code = ''
        try { code = (await response.error.context.json()).error } catch { /* Network failure. */ }
        if (code === 'SEARCH_BUSY' && attempt === 0) { await delay(1500); continue }
        throw new Error('PHOTO_UNAVAILABLE')
      }
      const photo: Photo | null = response.data?.photo ?? null
      if (photo && !validPhoto(photo)) throw new Error('INVALID_PHOTO')
      if (cache.size >= 200) cache.delete(cache.keys().next().value!)
      const entry = { photo, expires: Date.now() + 300000 }
      cache.set(key, entry)
      if (photo?.identity.startsWith('mb:')) cache.set(photo.identity, entry)
      return photo
    }
    return null
  })
  queue = task
  pending.set(key, { promise: task, wanted })
  void task.finally(() => pending.delete(key)).catch(() => {})
  return task
}

export function ArtistPhoto({ name, mbid, bandId, color = '#a8c0ab' }: { name: string; mbid?: string; bandId?: string; color?: string }) {
  const key = mbid ? `mb:${mbid}` : `band:${bandId}`
  const element = useRef<HTMLElement>(null)
  const [state, setState] = useState<{ key: string; photo: Photo | null; failed: boolean }>({ key: '', photo: null, failed: false })
  useEffect(() => {
    const id = mbid ?? bandId
    if (!id || !uuid.test(id) || !backend || typeof IntersectionObserver === 'undefined') return
    let active = true, started = false
    const observer = new IntersectionObserver(entries => {
      if (started || !entries.some(entry => entry.isIntersecting)) return
      started = true; observer.disconnect()
      void loadArtistPhoto(key, mbid ? { id: mbid } : { band_id: bandId }, () => active).then(photo => {
        if (active) setState({ key, photo, failed: false })
      }).catch(() => { /* Optional photos never block search or following. */ })
    }, { rootMargin: '100px' })
    if (element.current) observer.observe(element.current)
    return () => { active = false; observer.disconnect() }
  }, [key, mbid, bandId])
  const photo = state.key === key && !state.failed ? state.photo : null
  return <figure ref={element} className="artist-photo">
    {photo ? <img src={photo.url} alt={`${name} 프로필`} width={80} height={80} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setState(s => ({ ...s, failed: true }))} /> : <span className="artist-photo-fallback" style={{ background: color }} aria-label={`${name} 이니셜`}>{Array.from(name).slice(0, 2).join('')}</span>}
    {photo && <figcaption><a href={photo.source} target="_blank" rel="noopener noreferrer">사진: {photo.author}</a>{photo.credit && <span>{photo.credit}</span>}<a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">{photo.license}</a><span>썸네일 표시</span></figcaption>}
  </figure>
}

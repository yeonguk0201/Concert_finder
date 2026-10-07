import { useCallback, useEffect, useState } from 'react'
import { accountMode, backend, configurationError } from './backend'
import { bands as fixtures, concerts as fixtureConcerts } from './data'
import type { Band, Concert } from './data'
import { mapBands, mapConcerts } from './catalog'
import type { BandRow, ConcertRow } from './catalog'
import { useRealtime } from './useRealtime'

export function useCatalog() {
  const [data, setData] = useState<{ bands: Band[]; concerts: Concert[] }>({ bands: accountMode ? [] : fixtures, concerts: accountMode ? [] : fixtureConcerts })
  const [loading, setLoading] = useState(Boolean(backend))
  const [error, setError] = useState(configurationError)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!backend) return
    let active = true
    queueMicrotask(() => { if (active) { setLoading(true); setError('') } })
    void Promise.all([
      backend.from('bands').select('id,name,aliases,country_code,description').order('name'),
      backend.from('concerts').select('id,title,format,city,venue,starts_on,ends_on,announced_on,cancelled,concert_bands(band_id),ticket_schedules(id,opens_at,price_description,booking_url),concert_sources(url,label,verified_at)').eq('status', 'published'),
    ]).then(([bandResult, concertResult]) => {
      if (!active) return
      if (bandResult.error || concertResult.error) throw new Error('catalog')
      const bands = mapBands(bandResult.data as BandRow[])
      setData({ bands, concerts: mapConcerts(concertResult.data as ConcertRow[], bands) }); setLoading(false)
    }).catch(() => { if (active) { setError('공연 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'); setLoading(false) } })
    return () => { active = false }
  }, [revision])
  const reload = useCallback(() => setRevision(r => r + 1), [])
  const syncStatus = useRealtime('catalog_signal', null, reload)
  return { ...data, loading, error, reload, syncStatus }
}

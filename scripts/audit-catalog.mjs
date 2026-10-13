// Read only. Flags are review leads, never an instruction to delete or withdraw.
import { createClient } from '@supabase/supabase-js'
const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
try {
  if (!url || !key) throw new Error('Catalog audit environment missing')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.from('concerts').select('id,title,status,starts_on,concert_sources(url,verified_at),concert_bands(bands(name))').order('title').limit(500)
  if (error) throw new Error(`Catalog audit failed: ${error.code ?? 'query'}`)
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), read_only: true, possibly_truncated: data.length === 500,
    rows: data.map(c => ({ ...c, review_flags: [
      ...(/test|테스트|가상|sample|autumn frequencies/i.test(c.title) ? ['테스트 이름: 원문 대조 필요'] : []),
      ...(!c.concert_sources.some(s => s.verified_at) ? ['확인된 출처 없음'] : []),
      ...(c.concert_sources.some(s => ['test.com','example.com','example.test','official.example'].includes(new URL(s.url).hostname)) ? ['테스트용 출처: 공개 중단 검토'] : []),
      ...(c.concert_sources.some(s => s.url === 'https://ualive.com/concerts/397') && c.concert_bands.some(b => !['my chemical romance','mcr','마이 케미컬 로맨스'].includes(b.bands?.name?.toLowerCase())) ? ['MCR 공식 원문 외 출연진: N02 테스트 원복 대상 대조'] : []),
    ] })) }, null, 2))
} catch (error) { console.error(error.message); process.exitCode = 1 }

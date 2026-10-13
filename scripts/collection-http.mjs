// Fixed adapter URLs only; redirects never cross into internal or unreviewed hosts.
export async function getText(url, fetcher = fetch, allowMissing = false) {
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'EncoreCatalog/0.2 (official concert metadata review)' } })
  if (allowMissing && response.status === 404) return ''
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (Number(response.headers.get('content-length')) > 2000000) throw new Error('Response too large')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2000000) throw new Error('Response too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
}
export function checkRobots(text, paths) {
  // Conservative: honour every disallow group, including adapter-specific groups.
  for (const line of text.split(/\r?\n/)) {
    const path = line.replace(/#.*/, '').match(/^\s*Disallow:\s*(\S+)/i)?.[1]
    if (!path) continue
    const pattern = new RegExp('^' + path.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'))
    if (paths.some(p => pattern.test(p))) throw new Error('Collection disallowed by robots.txt')
  }
}
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

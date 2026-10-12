import { readFile, writeFile } from 'node:fs/promises'
import { createArtistResolver, musicbrainzMatches } from './artist-discovery.mjs'

// Verify provider IDs read-only before using the generated manifest for seeding.
const starters = [
  ['DAY6','KR',['데이식스','데이6']], ['JANNABI','KR',['잔나비']], ['Silica Gel','KR',['실리카겔']], ['HYUKOH','KR',['혁오']],
  ['SURL','KR',['설']], ['THORNAPPLE','KR',['쏜애플']], ['TOUCHED','KR',['터치드']], ['YdBB','KR',['유다빈밴드']],
  ['Ado','JP',['아도']], ['Mrs. GREEN APPLE','JP',['미세스 그린 애플','미세스그린애플']], ['ONE OK ROCK','JP',['원오크록','원오케이락','ワンオクロック']],
  ['RADWIMPS','JP',['래드윔프스','ラッドウィンプス']], ['King Gnu','JP',['킹누','キングヌー']], ['SEKAI NO OWARI','JP',['세카이노오와리','世界の終わり']],
  ['ヨルシカ','JP',['요루시카','Yorushika']], ['KANA-BOON','JP',['카나분']], ['ELLEGARDEN','JP',['엘르가든']],
  ['Muse','GB',['뮤즈']], ['Radiohead','GB',['라디오헤드']], ['Coldplay','GB',['콜드플레이']], ['Foo Fighters','US',['푸 파이터스']],
  ['Arctic Monkeys','GB',['악틱 몽키즈']], ['Linkin Park','US',['린킨 파크']], ['My Chemical Romance','US',['마이 케미컬 로맨스','MCR']], ['Oasis','GB',['오아시스']],
]
const path=process.argv.find(a=>a.startsWith('--output='))?.slice(9) ?? 'starter-artists.local'
let prior = { identities: [] }
try { prior = JSON.parse(await readFile(path,'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const identities = [...prior.identities], unresolved = []
let resolve = createArtistResolver({ maxRequests: 30 })
for (const [name, country, aliases] of starters) {
  if (identities.some(a=>a.country===country && [a.name,...a.aliases].some(n=>[name,...aliases].includes(n)))) continue
  try {
    let found
    try { found=await resolve(name) } catch (error) {
      if (!/503|unavailable/.test(error.message)) throw error
      await new Promise(r=>setTimeout(r,5000))
      resolve=createArtistResolver({maxRequests:30})
      found=await resolve(name)
    }
    if (!found.length || found.some(a=>a.truncated) || found.filter(a=>a.country===country).length!==1) {
      await new Promise(r=>setTimeout(r,1200))
      const query=`artist:"${name.replace(/[\\"]/g,'\\$&')}" AND country:${country}`
      const response=await fetch(`https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(query)}&fmt=json&limit=25`,{headers:{'User-Agent':'EncoreCatalog/0.3 (https://github.com/yeonguk0201/concert-finder)'},signal:AbortSignal.timeout(5000)})
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      found=musicbrainzMatches(await response.json(),name)
    }
    const matches = found.filter(a => a.country === country && ['Person','Group'].includes(a.type))
    if (matches.length !== 1 || matches[0].truncated) throw new Error('IDENTITY_AMBIGUOUS')
    identities.push({ ...matches[0], aliases: [...new Set([...aliases,...matches[0].aliases])].slice(0,50) })
    console.error(`${name}: verified`)
  } catch (error) { unresolved.push({ name, country, reason: error.message }); console.error(`${name}: unresolved`) }
}
await writeFile(path,JSON.stringify({checked_at:new Date().toISOString(),identities,unresolved},null,2)+'\n','utf8')
console.log(JSON.stringify({verified:identities.length,unresolved:unresolved.length,output:path}))

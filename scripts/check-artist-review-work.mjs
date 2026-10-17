import { randomUUID } from 'node:crypto'
import { appendFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const ENDPOINT = 'https://czjrzylvnewfjnfwjhwf.supabase.co/functions/v1/artist-review-runner'
const reasons = new Set(['review_due', 'no_work', 'schedule_window', 'lease_active', 'lease_recovery'])

// This process never calls an LLM, research provider, claim, checkpoint, or notice acknowledgement.
export async function checkReviewWork({ env = process.env, fetcher = fetch } = {}) {
  if (env.ARTIST_REVIEW_ENDPOINT !== ENDPOINT || !env.ARTIST_REVIEW_RUNNER_SECRET?.trim()) {
    throw new Error('RUNNER_CONFIGURATION_REQUIRED')
  }
  let response
  try {
    response = await fetcher(ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ARTIST_REVIEW_RUNNER_SECRET}` },
      body: JSON.stringify({ action: 'readiness', runId: randomUUID() }) })
  } catch { throw new Error('READINESS_UNAVAILABLE') }
  if (!response.ok) throw new Error(response.status === 401 ? 'RUNNER_UNAUTHORIZED' : 'READINESS_UNAVAILABLE')
  let data
  try {
    // Never echo arbitrary upstream bodies, URLs, headers, or provider errors into workflow logs.
    const body = await response.text()
    if (body.length > 2000) throw new Error('oversized')
    data = JSON.parse(body)
  } catch { throw new Error('INVALID_READINESS_RESPONSE') }
  if (!data || Object.keys(data).some(key => !['state', 'reason', 'eligible', 'notices'].includes(key))
    || !['ready', 'idle', 'busy'].includes(data.state) || !reasons.has(data.reason)
    || !Number.isInteger(data.eligible) || data.eligible < 0 || data.eligible > 10
    || !Number.isInteger(data.notices) || data.notices < 0 || data.notices > 30
    || (data.state !== 'ready' && data.eligible !== 0)) throw new Error('INVALID_READINESS_RESPONSE')
  return { ...data, manualReviewRequired: data.state === 'ready' || data.notices > 0 }
}

async function main(args) {
  if (args.length) throw new Error('ARGUMENT_INVALID')
  const result = await checkReviewWork()
  console.log(JSON.stringify(result))
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT,
    `manual_review_required=${result.manualReviewRequired}\neligible=${result.eligible}\nnotices=${result.notices}\n`, 'utf8')
  if (result.manualReviewRequired && process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## 아티스트 수동 검수 필요\n\n검수 가능한 대상: ${result.eligible}팀 · 미전달 알림: ${result.notices}건\n\n` +
      '클라우드에서 승인된 검수 스킬과 서버 실행기를 수동 실행하세요. 이 검사는 모델을 호출하거나 대상을 선점하지 않습니다.\n', 'utf8')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).catch(error => {
  const safe = new Set(['RUNNER_CONFIGURATION_REQUIRED', 'RUNNER_UNAUTHORIZED', 'READINESS_UNAVAILABLE', 'INVALID_READINESS_RESPONSE', 'ARGUMENT_INVALID'])
  console.error(JSON.stringify({ error: safe.has(error.message) ? error.message : 'READINESS_CHECK_FAILED' }))
  process.exitCode = 1
})

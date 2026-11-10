const dispatchUrl =
  'https://api.github.com/repos/yeonguk0201/Concert_finder/actions/workflows/collect-kopis-api.yml/dispatches'

export default {
  async scheduled(controller, env) {
    if (!env.GITHUB_DISPATCH_TOKEN) throw new Error('KOPIS GitHub credential is missing')

    const execute = Boolean(env.KOPIS_EXECUTE_CRON) && controller.cron === env.KOPIS_EXECUTE_CRON
    const response = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + env.GITHUB_DISPATCH_TOKEN,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2026-03-10',
      },
      body: JSON.stringify({ ref: 'main', inputs: { execute } }),
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    })

    if (response.status !== 200) {
      throw new Error('KOPIS GitHub dispatch returned HTTP ' + response.status)
    }
    const { workflow_run_id: runId } = await response.json()
    if (!Number.isSafeInteger(runId) || runId <= 0) {
      throw new Error('KOPIS GitHub dispatch did not return a run ID')
    }

    console.log(JSON.stringify({ execute, runId }))
  },
}

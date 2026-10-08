import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

export function prepareConfiguration(source, existingSecret) {
  const names = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
  if (names.some(name => !source[name]?.trim())) throw new Error('Missing VAPID configuration')
  const url = new URL(source.SUPABASE_URL)
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url.href)) throw new Error('Expected hosted Supabase project URL')
  const secret = existingSecret || randomBytes(32).toString('hex')
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid existing cron secret')
  const secrets = Object.fromEntries(names.map(name => [name, source[name].trim()]))
  secrets.NOTIFICATION_CRON_SECRET = secret
  const env = Object.entries(secrets).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n'
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  const rows = [['encore_notification_url', url.origin], ['encore_notification_token', secret]]
  const sql = '-- PRIVATE: execute in SQL Editor; never share or commit this file.\nbegin;\n' + rows.map(([name, value]) => `do $setup$\ndeclare target uuid;\nbegin\n  if (select count(*) from vault.secrets where name=${quote(name)})>1 then\n    raise exception 'Duplicate notification Vault secret';\n  end if;\n  select id into target from vault.secrets where name=${quote(name)};\n  if target is null then\n    perform vault.create_secret(${quote(value)},${quote(name)});\n  else\n    perform vault.update_secret(target,${quote(value)},${quote(name)});\n  end if;\nend $setup$;`).join('\n') + '\ncommit;\n'
  return { env, sql, projectRef: url.hostname.split('.')[0] }
}

async function main() {
  const source = parseEnv(await readFile('.env.push.local', 'utf8'))
  const directory = '.supabase-push.local'
  const envPath = resolve(directory, 'secrets.env')
  let existingSecret
  try {
    existingSecret = parseEnv(await readFile(envPath, 'utf8')).NOTIFICATION_CRON_SECRET
    if (!existingSecret) throw new Error('Existing secrets file has no cron secret')
  }
  catch (error) { if (error.code !== 'ENOENT') throw error }
  const configuration = prepareConfiguration(source, existingSecret)
  await mkdir(directory, { recursive: true })
  await writeFile(envPath, configuration.env, { encoding: 'utf8', mode: 0o600 })
  await writeFile(resolve(directory, 'vault-setup.sql'), configuration.sql, { encoding: 'utf8', mode: 0o600 })
  // Project reference and paths are public metadata; never print the generated secret.
  console.log(`Prepared ${directory}/secrets.env and ${directory}/vault-setup.sql (Git ignored).`)
  console.log(`Project reference: ${configuration.projectRef}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Push setup preparation failed. Check .env.push.local; no secret values were printed.'); process.exitCode = 1 })
}

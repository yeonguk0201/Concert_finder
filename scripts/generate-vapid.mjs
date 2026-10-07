import webpush from 'web-push'
import { writeFile } from 'node:fs/promises'
const keys = webpush.generateVAPIDKeys()
await writeFile(new URL('../.env.push.local', import.meta.url),
  `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=mailto:replace-with-your-operator-email@example.com\nSUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\n`,
  { encoding: 'utf8', flag: 'wx', mode: 0o600 })
console.log('Created ignored .env.push.local. Keys are not printed. Keep this file private; do not overwrite an existing key pair.')

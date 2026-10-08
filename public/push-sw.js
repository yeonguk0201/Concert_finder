self.addEventListener('push', event => {
  let data
  try { data = event.data?.json() } catch { return }
  if (!data || typeof data.title !== 'string') return
  let url
  try { url = new URL(data.url || '/', self.location.origin) } catch { return }
  if (url.origin !== self.location.origin) return
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body, tag: data.tag, data: { url: url.href }, icon: '/app-icon.svg',
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  let url
  try { url = new URL(event.notification.data?.url || '/', self.location.origin) } catch { return }
  if (url.origin !== self.location.origin) return
  event.waitUntil(self.clients.openWindow(url.href))
})

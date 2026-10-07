import { useEffect, useRef, useState } from 'react'
import { backend } from './backend'

export function useRealtime(table: 'catalog_signal' | 'account_signals', owner: string | null, refresh: () => void) {
  const callback = useRef(refresh)
  useEffect(() => { callback.current = refresh }, [refresh])
  const [status, setStatus] = useState('connecting')
  useEffect(() => {
    if (!backend || (table === 'account_signals' && !owner)) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const reconcile = () => { if (active && !timer) timer = setTimeout(() => { timer = undefined; if (active) callback.current() }, 150) }
    const channel = backend.channel(`encore-${table}-${owner ?? 'public'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(owner ? { filter: `user_id=eq.${owner}` } : {}) }, reconcile)
      .subscribe(state => {
        if (!active) return
        setStatus(state === 'SUBSCRIBED' ? 'connected' : 'reconnecting')
        if (state === 'SUBSCRIBED') reconcile() // Catch changes between initial read and subscription or reconnect.
      })
    const visible = () => { if (document.visibilityState === 'visible') reconcile() }
    window.addEventListener('online', reconcile)
    document.addEventListener('visibilitychange', visible)
    // Recovery also covers disabled publications and dropped events.
    const fallback = setInterval(reconcile, 30000)
    return () => {
      active = false; clearTimeout(timer); clearInterval(fallback)
      window.removeEventListener('online', reconcile); document.removeEventListener('visibilitychange', visible)
      void backend!.removeChannel(channel)
    }
  }, [table, owner])
  return status
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { readAccount, writeAccount } from './accountApi'
import type { Collection } from './accountApi'

type Snapshot = { owner: string | null; bands: string[]; schedules: string[]; loading: boolean; error: string; pending: string[] }
const blank = (owner: string | null): Snapshot => ({ owner, bands: [], schedules: [], loading: Boolean(owner), error: '', pending: [] })

export function useAccountStorage(userId: string | null) {
  const [state, setState] = useState<Snapshot>(() => blank(userId))
  const [revision, setRevision] = useState(0)
  // Owner is checked during render too: never expose the previous account for a frame.
  const owner = useRef(userId)
  useLayoutEffect(() => { owner.current = userId }, [userId])
  const scope = useRef<{ active: boolean } | null>(null)
  const locks = useRef(new Set<string>())
  useEffect(() => {
    const current = { active: true }
    scope.current = current
    locks.current.clear()
    queueMicrotask(() => { if (current.active) setState(blank(userId)) })
    if (!userId) return
    void readAccount(userId).then(data => {
      if (current.active && owner.current === userId) setState({ ...blank(userId), ...data, loading: false })
    }).catch(() => {
      if (current.active && owner.current === userId) setState({ ...blank(userId), loading: false, error: '계정 저장 목록을 불러오지 못했습니다. 다시 불러오기를 눌러 주세요.' })
    })
    return () => { current.active = false }
  }, [userId, revision])
  const view = state.owner === userId ? state : blank(userId)
  const reload = useCallback(() => { if (!locks.current.size) setRevision(r => r + 1) }, [])
  const toggle = async (collection: Collection, id: string): Promise<boolean | undefined> => {
    if (!userId || view.loading || view.error) return false
    const lock = `${collection}:${id}`
    if (locks.current.has(lock)) return false
    const current = scope.current
    const add = !view[collection].includes(id)
    locks.current.add(lock)
    setState(s => ({ ...s, pending: [...s.pending, lock] }))
    try {
      await writeAccount(userId, collection, id, add)
      if (!current?.active || owner.current !== userId) return undefined
      setState(s => ({ ...s, [collection]: add ? [...new Set([...s[collection], id])] : s[collection].filter(value => value !== id) }))
      return true
    } catch { return current?.active && owner.current === userId ? false : undefined }
    finally {
      if (current?.active && owner.current === userId) {
        locks.current.delete(lock)
        setState(s => ({ ...s, pending: s.pending.filter(value => value !== lock) }))
      }
    }
  }
  return { ...view, reload, toggle }
}

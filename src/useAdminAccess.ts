import { useEffect, useState } from 'react'
import { backend } from './backend'

export function useAdminAccess(userId: string | null) {
  const [access, setAccess] = useState<{ userId: string | null; allowed: boolean; error: string }>({ userId: null, allowed: false, error: '' })
  const [revision, setRevision] = useState(0)
  if (access.userId !== userId) setAccess({ userId, allowed: false, error: '' })
  useEffect(() => {
    let active = true
    if (backend && userId) {
      void (async () => {
        try {
          const { data, error } = await backend.rpc('is_catalog_admin')
          if (active) setAccess({ userId, allowed: !error && data === true, error: error ? '관리자 권한 확인에 실패했습니다.' : '' })
        } catch { if (active) setAccess({ userId, allowed: false, error: '관리자 권한 확인에 실패했습니다.' }) }
      })()
    }
    return () => { active = false }
  }, [userId, revision])
  return { allowed: Boolean(userId && access.userId === userId && access.allowed), error: access.userId === userId ? access.error : '', reload: () => setRevision(r => r + 1) }
}

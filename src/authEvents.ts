export const authCheckEvent = 'encore:auth-check'

// A foreign-key failure can mean the JWT outlived its deleted Auth user.
// Ask Auth to verify that assumption; unrelated constraint errors must not log out users.
export function requestAuthCheck(code?: string) {
  if (code === '23503' && typeof window !== 'undefined') window.dispatchEvent(new Event(authCheckEvent))
}

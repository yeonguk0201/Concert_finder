import type { ReactNode } from 'react'
export type IconName = 'home' | 'search' | 'heart' | 'bell' | 'arrow' | 'close' | 'calendar' | 'pin' | 'user'
export function Icon({ name }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    heart: <path d="M20.5 5.5a5 5 0 0 0-7 0L12 7l-1.5-1.5a5 5 0 0 0-7 7L12 21l8.5-8.5a5 5 0 0 0 0-7Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v6M17 2v6M3 11h18" /></>,
    arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-3a8 8 0 0 1 16 0v3" /></>,
    bell: <><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Z" /><path d="M10 21h4" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    pin: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

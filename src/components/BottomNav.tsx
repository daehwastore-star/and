'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/', label: '홈', icon: '🏠' },
  { href: '/schedule', label: '스케줄', icon: '📅' },
  { href: '/songs', label: '합주곡', icon: '🎵' },
  { href: '/journal', label: '기록', icon: '📔' },
  { href: '/settle', label: '정산', icon: '💸' },
]

export default function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(tab => {
          const active =
            tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs ${
                active ? 'text-brand font-semibold' : 'text-zinc-500'
              }`}
            >
              <span className="text-lg leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyId, clearMyId } from '@/lib/identity'

interface Member {
  id: string
  name: string
  photo: string | null
}

// 홈 우측 상단: 내 프로필 바로가기 + 로그아웃(계정 전환)
export default function MyIdentity() {
  const [me, setMe] = useState<Member | null>(null)

  useEffect(() => {
    const id = getMyId()
    if (!id) return
    fetch('/api/members')
      .then(r => r.json())
      .then(d => {
        const m = (d.members as Member[]).find(x => x.id === id)
        if (m) setMe(m)
        else clearMyId() // 삭제된 멤버면 초기화
      })
      .catch(() => {})
  }, [])

  if (!me) return null

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link
        href={`/members/${me.id}`}
        className="flex items-center gap-1.5 rounded-full bg-brand/10 py-1 pl-1 pr-3 text-sm font-semibold text-brand"
      >
        {me.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${me.photo}`}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/20 text-xs font-bold">
            {me.name[0]}
          </span>
        )}
        내 프로필
      </Link>
      <button
        type="button"
        aria-label="로그아웃"
        onClick={() => {
          clearMyId()
          location.reload()
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-zinc-500"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMyId, clearMyId } from '@/lib/identity'

interface Member {
  id: string
  name: string
}

// 홈 상단 "나: OO" 표시 + 프로필 바로가기 + 계정 전환
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
    <div className="mt-3 flex items-center gap-2 text-sm">
      <Link
        href={`/members/${me.id}`}
        className="rounded-full bg-brand/10 px-3 py-1.5 font-semibold text-brand"
      >
        나: {me.name} · 내 프로필 ›
      </Link>
      <button
        type="button"
        onClick={() => {
          clearMyId()
          location.reload()
        }}
        className="rounded-full bg-surface px-3 py-1.5 text-zinc-500"
      >
        계정 바꾸기
      </button>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { getMyId, setMyId } from '@/lib/identity'

interface Member {
  id: string
  name: string
  roles: string | null
  photo: string | null
}

// 첫 진입 시 "누구세요?" 선택 → 기기에 저장, 이후엔 바로 통과
export default function IdentityGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'pick' | 'ok'>('checking')
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    if (getMyId()) {
      setStatus('ok')
      return
    }
    setStatus('pick')
    fetch('/api/members')
      .then(r => r.json())
      .then(d => setMembers(d.members))
      .catch(() => {})
  }, [])

  if (status === 'ok') return <>{children}</>

  if (status === 'checking') {
    return <div className="min-h-dvh" />
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 pb-16">
      <h1 className="text-center text-2xl font-bold">🎸 누구세요?</h1>
      <p className="mt-2 text-center text-sm text-zinc-500">
        내 프로필을 선택하면 이 기기에 저장돼요.
        <br />다음부터는 바로 들어와져요!
      </p>
      <div className="mt-8 grid grid-cols-3 gap-3">
        {members.length === 0 ? (
          <p className="col-span-3 text-center text-sm text-zinc-500">불러오는 중…</p>
        ) : (
          members.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setMyId(m.id)
                setStatus('ok')
              }}
              className="flex flex-col items-center rounded-2xl bg-surface p-3 active:bg-surface-2"
            >
              {m.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/photos/${m.photo}`}
                  alt={m.name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                  {m.name[0]}
                </span>
              )}
              <span className="mt-2 text-sm font-semibold">{m.name}</span>
              {m.roles && (
                <span className="mt-0.5 text-center text-xs text-zinc-500">
                  {m.roles.split(',').join(' · ')}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </main>
  )
}

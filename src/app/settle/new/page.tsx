'use client'

import BackButton from '@/components/BackButton'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RehearsalForm, { type Member } from '@/components/RehearsalForm'

export default function NewRehearsalPage() {
  const router = useRouter()
  const [members, setMembers] = useState<Member[] | null>(null)

  useEffect(() => {
    fetch('/api/members')
      .then(r => r.json())
      .then(d => setMembers(d.members))
  }, [])

  if (!members) {
    return (
      <main className="px-4 pt-8">
      <BackButton fallback="/settle" />
        <p className="text-zinc-500">불러오는 중…</p>
      </main>
    )
  }

  return (
    <main className="px-4 pt-8">
      <BackButton fallback="/settle" />
      <h1 className="text-2xl font-bold">새 정산</h1>
      <p className="mt-1 text-sm text-zinc-500">
        합주 정보를 입력하면 자동으로 계산돼요
      </p>
      <div className="mt-6">
        <RehearsalForm
          members={members}
          submitLabel="정산 저장"
          onSubmit={async payload => {
            const res = await fetch('/api/rehearsals', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || '저장 실패')
            router.push(`/settle/${data.rehearsal.id}`)
            router.refresh()
          }}
        />
      </div>
    </main>
  )
}

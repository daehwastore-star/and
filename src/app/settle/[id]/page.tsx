'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RehearsalForm, { type Member } from '@/components/RehearsalForm'
import { calcSettlement, won } from '@/lib/settlement'
import { fmtDateTime } from '@/lib/format'

interface Attendance {
  memberId: string
  late: boolean
  afterParty: boolean
  member: { name: string }
}
interface Rehearsal {
  id: string
  date: string
  hours: number
  roomCost: number
  afterPartyCost: number
  memo: string | null
  attendances: Attendance[]
}

export default function RehearsalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [rehearsal, setRehearsal] = useState<Rehearsal | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [res, memberRes] = await Promise.all([
      fetch(`/api/rehearsals/${id}`),
      fetch('/api/members'),
    ])
    if (!res.ok) {
      setError('정산 기록을 찾을 수 없어요')
      return
    }
    const data = await res.json()
    const memberData = await memberRes.json()
    setRehearsal(data.rehearsal)
    setMembers(memberData.members)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const remove = async () => {
    if (!confirm('이 정산 기록을 삭제할까요?')) return
    await fetch(`/api/rehearsals/${id}`, { method: 'DELETE' })
    router.push('/settle')
    router.refresh()
  }

  if (!rehearsal) {
    return (
      <main className="px-4 pt-8">
        <p className="text-zinc-400">{error || '불러오는 중…'}</p>
      </main>
    )
  }

  const result = calcSettlement(
    rehearsal.roomCost,
    rehearsal.hours,
    rehearsal.afterPartyCost,
    rehearsal.attendances.map(a => ({
      memberId: a.memberId,
      name: a.member.name,
      late: a.late,
      afterParty: a.afterParty,
    })),
  )

  if (editing) {
    return (
      <main className="px-4 pt-8">
        <h1 className="text-2xl font-bold">정산 수정</h1>
        <div className="mt-6">
          <RehearsalForm
            members={members}
            initial={{
              date: rehearsal.date,
              hours: rehearsal.hours,
              roomCost: rehearsal.roomCost,
              afterPartyCost: rehearsal.afterPartyCost,
              memo: rehearsal.memo,
              attendances: rehearsal.attendances.map(a => ({
                memberId: a.memberId,
                late: a.late,
                afterParty: a.afterParty,
              })),
            }}
            submitLabel="수정 저장"
            onSubmit={async payload => {
              const res = await fetch(`/api/rehearsals/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
              const data = await res.json()
              if (!res.ok) throw new Error(data.error || '저장 실패')
              setEditing(false)
              await load()
            }}
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 w-full rounded-xl bg-surface py-3 text-sm text-zinc-300"
          >
            취소
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">{fmtDateTime(rehearsal.date)}</h1>
      <p className="mt-1 text-sm text-zinc-400">
        {rehearsal.hours}시간 합주 · {result.attendeeCount}명 참석
        {rehearsal.memo && ` · ${rehearsal.memo}`}
      </p>

      {/* 비용 요약 */}
      <section className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-zinc-500">합주비</div>
          <div className="mt-1 text-lg font-bold">{won(rehearsal.roomCost)}</div>
          <div className="text-xs text-zinc-500">
            시간당 {won(result.hourlyRate)}
          </div>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-zinc-500">뒤풀이</div>
          <div className="mt-1 text-lg font-bold">
            {rehearsal.afterPartyCost > 0 ? won(rehearsal.afterPartyCost) : '없음'}
          </div>
          {result.afterPartyCount > 0 && (
            <div className="text-xs text-zinc-500">{result.afterPartyCount}명 참석</div>
          )}
        </div>
      </section>

      {/* 인당 정산표 */}
      <section className="mt-4 overflow-hidden rounded-2xl bg-surface">
        <div className="border-b border-white/10 px-4 py-3 font-semibold">
          인당 낼 금액
        </div>
        {result.shares.map(s => (
          <div
            key={s.memberId}
            className="flex items-center justify-between border-b border-white/5 px-4 py-3 last:border-0"
          >
            <div>
              <div className="font-medium">
                {s.name}
                {s.late && <span className="ml-1 text-amber-400">🕑 지각</span>}
                {s.afterParty && <span className="ml-1">🍻</span>}
              </div>
              <div className="text-xs text-zinc-500">
                합주 {won(s.rehearsalShare)}
                {s.latePenalty > 0 && ` + 지각 ${won(s.latePenalty)}`}
                {s.afterPartyShare > 0 && ` + 뒤풀이 ${won(s.afterPartyShare)}`}
              </div>
            </div>
            <div className="text-lg font-bold text-brand">{won(s.total)}</div>
          </div>
        ))}
      </section>

      {result.lateCount > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          🕑 지각자는 1시간 비용({won(result.hourlyRate)})의 절반인{' '}
          {won(result.latePenaltyEach)}을 추가 부담하고, 남은 금액을 전원이 나눠요.
        </p>
      )}

      <section className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex-1 rounded-xl bg-surface py-3 text-sm text-zinc-300"
        >
          수정
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-xl bg-surface px-4 py-3 text-sm text-red-400"
        >
          삭제
        </button>
      </section>
    </main>
  )
}

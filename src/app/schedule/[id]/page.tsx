'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fmtDateTime } from '@/lib/format'

interface Member {
  id: string
  name: string
  isGuest: boolean
}
interface Vote {
  memberId: string
  available: boolean
  member: { name: string }
}
interface Option {
  id: string
  startsAt: string
  votes: Vote[]
}
interface Poll {
  id: string
  title: string
  closed: boolean
  options: Option[]
}

export default function PollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [poll, setPoll] = useState<Poll | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [me, setMe] = useState<string>('')
  // optionId → true(가능)/false(불가)/undefined(미응답)
  const [myVotes, setMyVotes] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [pollRes, memberRes] = await Promise.all([
      fetch(`/api/polls/${id}`),
      fetch('/api/members'),
    ])
    if (!pollRes.ok) {
      setError('투표를 찾을 수 없어요')
      return
    }
    const pollData = await pollRes.json()
    const memberData = await memberRes.json()
    setPoll(pollData.poll)
    setMembers(memberData.members)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // 멤버 선택 시 기존 투표 불러오기
  useEffect(() => {
    if (!poll || !me) return
    const mine: Record<string, boolean> = {}
    for (const opt of poll.options) {
      const v = opt.votes.find(x => x.memberId === me)
      if (v) mine[opt.id] = v.available
    }
    setMyVotes(mine)
  }, [poll, me])

  const save = async () => {
    if (!me) return setError('내 이름을 먼저 선택해주세요')
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/polls/${id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: me,
          votes: Object.entries(myVotes).map(([optionId, available]) => ({
            optionId,
            available,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const toggleClosed = async () => {
    if (!poll) return
    await fetch(`/api/polls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closed: !poll.closed }),
    })
    await load()
  }

  const remove = async () => {
    if (!confirm('이 투표를 삭제할까요?')) return
    await fetch(`/api/polls/${id}`, { method: 'DELETE' })
    router.push('/schedule')
    router.refresh()
  }

  if (!poll) {
    return (
      <main className="px-4 pt-8">
        <p className="text-zinc-400">{error || '불러오는 중…'}</p>
      </main>
    )
  }

  const maxYes = Math.max(
    0,
    ...poll.options.map(o => o.votes.filter(v => v.available).length),
  )

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold">{poll.title}</h1>
        {poll.closed && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-zinc-400">
            마감
          </span>
        )}
      </div>

      {/* 내 이름 선택 */}
      {!poll.closed && (
        <section className="mt-5 rounded-2xl bg-surface p-4">
          <h2 className="text-sm font-semibold text-zinc-300">1. 내 이름 선택</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMe(m.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  me === m.id
                    ? 'bg-brand font-semibold text-black'
                    : 'bg-surface-2 text-zinc-300'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>

          <h2 className="mt-4 text-sm font-semibold text-zinc-300">
            2. 되는 시간에 ⭕ / 안 되면 ❌
          </h2>
          <div className="mt-2 space-y-2">
            {poll.options.map(opt => (
              <div
                key={opt.id}
                className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2.5"
              >
                <span className="text-sm">{fmtDateTime(opt.startsAt)}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMyVotes(p => ({ ...p, [opt.id]: true }))}
                    className={`h-9 w-9 rounded-lg text-base ${
                      myVotes[opt.id] === true
                        ? 'bg-emerald-500/90'
                        : 'bg-white/5 opacity-60'
                    }`}
                  >
                    ⭕
                  </button>
                  <button
                    type="button"
                    onClick={() => setMyVotes(p => ({ ...p, [opt.id]: false }))}
                    className={`h-9 w-9 rounded-lg text-base ${
                      myVotes[opt.id] === false
                        ? 'bg-red-500/80'
                        : 'bg-white/5 opacity-60'
                    }`}
                  >
                    ❌
                  </button>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !me}
            className="mt-3 w-full rounded-xl bg-brand py-3 font-bold text-black disabled:opacity-40"
          >
            {saving ? '저장 중…' : '투표 저장'}
          </button>
        </section>
      )}

      {/* 결과 */}
      <section className="mt-4">
        <h2 className="text-base font-semibold">투표 현황</h2>
        <div className="mt-2 space-y-2">
          {poll.options.map(opt => {
            const yes = opt.votes.filter(v => v.available)
            const no = opt.votes.filter(v => !v.available)
            const isBest = yes.length > 0 && yes.length === maxYes
            return (
              <div
                key={opt.id}
                className={`rounded-2xl p-4 ${
                  isBest ? 'bg-brand/15 ring-1 ring-brand/40' : 'bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {fmtDateTime(opt.startsAt)}
                    {isBest && ' 👑'}
                  </span>
                  <span className="text-sm text-zinc-400">{yes.length}명 가능</span>
                </div>
                <div className="mt-1.5 space-y-0.5 text-sm">
                  {yes.length > 0 && (
                    <div className="text-emerald-400">
                      ⭕ {yes.map(v => v.member.name).join(', ')}
                    </div>
                  )}
                  {no.length > 0 && (
                    <div className="text-zinc-500">
                      ❌ {no.map(v => v.member.name).join(', ')}
                    </div>
                  )}
                  {opt.votes.length === 0 && (
                    <div className="text-zinc-500">아직 투표가 없어요</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 관리 */}
      <section className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={toggleClosed}
          className="flex-1 rounded-xl bg-surface py-3 text-sm text-zinc-300"
        >
          {poll.closed ? '투표 다시 열기' : '투표 마감하기'}
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

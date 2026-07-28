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
interface RehearsalSongItem {
  id: string
  songId: string
  song: { title: string; artist: string | null; artwork: string | null }
}
interface Rehearsal {
  id: string
  date: string
  hours: number
  roomCost: number
  afterPartyCost: number
  memo: string | null
  attendances: Attendance[]
  songs: RehearsalSongItem[]
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
  const [copied, setCopied] = useState(false)

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

  const copyShareText = async (r: Rehearsal) => {
    const res = calcSettlement(
      r.roomCost,
      r.hours,
      r.afterPartyCost,
      r.attendances.map(a => ({
        memberId: a.memberId,
        name: a.member.name,
        late: a.late,
        afterParty: a.afterParty,
      })),
    )
    const lines = [
      `🎸 ${fmtDateTime(r.date)} 합주 정산`,
      `합주 ${r.hours}시간 ${won(r.roomCost)}` +
        (r.afterPartyCost > 0 ? ` · 뒤풀이 ${won(r.afterPartyCost)}` : ''),
      '',
      ...res.shares.map(
        s =>
          `${s.name}: ${won(s.total)}` +
          (s.late ? ' (지각🕑)' : '') +
          (s.afterParty ? ' 🍻' : ''),
      ),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('복사에 실패했어요. 직접 캡처해서 공유해주세요!')
    }
  }

  if (!rehearsal) {
    return (
      <main className="px-4 pt-8">
        <p className="text-zinc-500">{error || '불러오는 중…'}</p>
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
              songIds: rehearsal.songs.map(s => s.songId),
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
            className="mt-3 w-full rounded-xl bg-surface py-3 text-sm text-zinc-700"
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
      <p className="mt-1 text-sm text-zinc-500">
        {rehearsal.hours}시간 합주 · {result.attendeeCount}명 참석
        {rehearsal.memo && ` · ${rehearsal.memo}`}
      </p>

      {/* 연습곡 */}
      {rehearsal.songs.length > 0 && (
        <section className="mt-4 overflow-hidden rounded-2xl bg-surface">
          <div className="border-b border-zinc-200 px-4 py-2.5 text-sm font-semibold">
            🎵 연습곡
          </div>
          {rehearsal.songs.map(rs => (
            <div
              key={rs.id}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2 last:border-0"
            >
              {rs.song.artwork ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rs.song.artwork} alt="" className="h-9 w-9 rounded-lg object-cover" />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2">
                  🎵
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{rs.song.title}</span>
                <span className="block truncate text-xs text-zinc-500">{rs.song.artist}</span>
              </span>
            </div>
          ))}
        </section>
      )}

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
      {result.shares.length === 0 ? (
        <section className="mt-4 rounded-2xl bg-brand/10 p-5 text-center">
          <p className="text-sm text-zinc-700">
            아직 정산 전이에요.
            <br />합주가 끝나면 아래 <b>정산 입력</b>으로 참석자와 비용을 채워주세요!
          </p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 w-full rounded-xl bg-brand py-3 font-bold text-white"
          >
            정산 입력하기
          </button>
        </section>
      ) : (
      <section className="mt-4 overflow-hidden rounded-2xl bg-surface">
        <div className="border-b border-zinc-200 px-4 py-3 font-semibold">
          인당 낼 금액
        </div>
        {result.shares.map(s => (
          <div
            key={s.memberId}
            className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 last:border-0"
          >
            <div>
              <div className="font-medium">
                {s.name}
                {s.late && <span className="ml-1 text-amber-600">🕑 지각</span>}
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
        <div className="p-3">
          <button
            type="button"
            onClick={() => copyShareText(rehearsal)}
            className="w-full rounded-xl bg-brand/10 py-3 font-semibold text-brand"
          >
            {copied ? '✓ 복사됐어요! 단톡방에 붙여넣기' : '📋 정산표 복사 (카톡 공유용)'}
          </button>
        </div>
      </section>
      )}

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
          className="flex-1 rounded-xl bg-surface py-3 text-sm text-zinc-700"
        >
          수정
        </button>
        <button
          type="button"
          onClick={remove}
          className="rounded-xl bg-surface px-4 py-3 text-sm text-red-500"
        >
          삭제
        </button>
      </section>
    </main>
  )
}

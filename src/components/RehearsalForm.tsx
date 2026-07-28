'use client'

import { useMemo, useState } from 'react'
import { calcSettlement, won, type AttendeeInput } from '@/lib/settlement'
import { localInputToKstIso, dateToLocalInput } from '@/lib/format'

export interface Member {
  id: string
  name: string
  isGuest: boolean
}

export interface RehearsalInitial {
  date: string
  hours: number
  roomCost: number
  afterPartyCost: number
  memo: string | null
  attendances: { memberId: string; late: boolean; afterParty: boolean }[]
}

interface AttendState {
  attending: boolean
  late: boolean
  afterParty: boolean
}

export default function RehearsalForm({
  members,
  initial,
  submitLabel,
  onSubmit,
}: {
  members: Member[]
  initial?: RehearsalInitial
  submitLabel: string
  onSubmit: (payload: {
    date: string
    hours: number
    roomCost: number
    afterPartyCost: number
    memo: string
    attendees: { memberId: string; late: boolean; afterParty: boolean }[]
  }) => Promise<void>
}) {
  const [date, setDate] = useState(initial ? dateToLocalInput(initial.date) : '')
  const [hours, setHours] = useState(initial?.hours ?? 2)
  const [roomCost, setRoomCost] = useState(initial?.roomCost ?? 0)
  const [afterPartyCost, setAfterPartyCost] = useState(initial?.afterPartyCost ?? 0)
  const [memo, setMemo] = useState(initial?.memo ?? '')
  const [attend, setAttend] = useState<Record<string, AttendState>>(() => {
    const st: Record<string, AttendState> = {}
    for (const m of members) {
      const a = initial?.attendances.find(x => x.memberId === m.id)
      st[m.id] = a
        ? { attending: true, late: a.late, afterParty: a.afterParty }
        : { attending: false, late: false, afterParty: false }
    }
    return st
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const attendees: AttendeeInput[] = useMemo(
    () =>
      members
        .filter(m => attend[m.id]?.attending)
        .map(m => ({
          memberId: m.id,
          name: m.name,
          late: attend[m.id].late,
          afterParty: attend[m.id].afterParty,
        })),
    [members, attend],
  )

  const preview = useMemo(
    () => calcSettlement(roomCost, hours, afterPartyCost, attendees),
    [roomCost, hours, afterPartyCost, attendees],
  )

  const toggle = (id: string, key: keyof AttendState) =>
    setAttend(prev => {
      const cur = prev[id]
      const next = { ...cur, [key]: !cur[key] }
      // 참석 해제 시 지각/뒤풀이도 해제
      if (key === 'attending' && !next.attending) {
        next.late = false
        next.afterParty = false
      }
      return { ...prev, [id]: next }
    })

  const submit = async () => {
    setError('')
    if (!date) return setError('합주 날짜를 입력해주세요')
    if (attendees.length === 0) return setError('참석자를 1명 이상 선택해주세요')
    setSaving(true)
    try {
      await onSubmit({
        date: localInputToKstIso(date),
        hours,
        roomCost,
        afterPartyCost,
        memo: memo.trim(),
        attendees: attendees.map(a => ({
          memberId: a.memberId,
          late: a.late,
          afterParty: a.afterParty,
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-semibold text-zinc-700">합주 날짜/시간</label>
        <input
          type="datetime-local"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-zinc-700">합주 시간</label>
        <div className="mt-1 flex gap-2">
          {[2, 3].map(h => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={`flex-1 rounded-xl py-3 font-semibold ${
                hours === h ? 'bg-brand text-white' : 'bg-surface text-zinc-700'
              }`}
            >
              {h}시간
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-zinc-700">합주실 비용 (원)</label>
        <input
          type="number"
          inputMode="numeric"
          value={roomCost || ''}
          onChange={e => setRoomCost(Number(e.target.value) || 0)}
          placeholder="예: 40000"
          className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-zinc-700">
          참석자 · 지각 · 뒤풀이
        </label>
        <div className="mt-1 overflow-hidden rounded-2xl bg-surface">
          <div className="grid grid-cols-[1fr_3.5rem_3.5rem] gap-1 border-b border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            <span>이름 (탭해서 참석 체크)</span>
            <span className="text-center">지각</span>
            <span className="text-center">뒤풀이</span>
          </div>
          {members.map(m => {
            const st = attend[m.id]
            return (
              <div
                key={m.id}
                className="grid grid-cols-[1fr_3.5rem_3.5rem] items-center gap-1 border-b border-zinc-100 px-4 py-2 last:border-0"
              >
                <button
                  type="button"
                  onClick={() => toggle(m.id, 'attending')}
                  className={`flex items-center gap-2 py-1 text-left text-base ${
                    st.attending ? '' : 'text-zinc-500'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md text-xs ${
                      st.attending ? 'bg-brand text-white' : 'bg-surface-2'
                    }`}
                  >
                    {st.attending ? '✓' : ''}
                  </span>
                  {m.name}
                  {m.isGuest && <span className="text-xs text-zinc-500">객원</span>}
                </button>
                <button
                  type="button"
                  disabled={!st.attending}
                  onClick={() => toggle(m.id, 'late')}
                  className={`mx-auto h-8 w-8 rounded-lg text-sm ${
                    st.late ? 'bg-amber-500 text-white' : 'bg-surface-2 text-zinc-500'
                  } disabled:opacity-30`}
                >
                  {st.late ? '🕑' : '－'}
                </button>
                <button
                  type="button"
                  disabled={!st.attending}
                  onClick={() => toggle(m.id, 'afterParty')}
                  className={`mx-auto h-8 w-8 rounded-lg text-sm ${
                    st.afterParty
                      ? 'bg-emerald-500 text-white'
                      : 'bg-surface-2 text-zinc-500'
                  } disabled:opacity-30`}
                >
                  {st.afterParty ? '🍻' : '－'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-semibold text-zinc-700">
          뒤풀이 비용 (원) <span className="font-normal text-zinc-500">— 없으면 0</span>
        </label>
        <input
          type="number"
          inputMode="numeric"
          value={afterPartyCost || ''}
          onChange={e => setAfterPartyCost(Number(e.target.value) || 0)}
          placeholder="예: 60000"
          className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-zinc-700">메모</label>
        <input
          type="text"
          value={memo}
          onChange={e => setMemo(e.target.value)}
          placeholder="예: OO합주실 3번방"
          className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* 실시간 정산 미리보기 */}
      {attendees.length > 0 && (roomCost > 0 || afterPartyCost > 0) && (
        <div className="rounded-2xl bg-brand/10 p-4 ring-1 ring-brand/30">
          <h3 className="text-sm font-bold text-brand">정산 미리보기</h3>
          <div className="mt-2 space-y-1.5 text-sm">
            {preview.shares.map(s => (
              <div key={s.memberId} className="flex items-center justify-between">
                <span>
                  {s.name}
                  {s.late && ' 🕑'}
                  {s.afterParty && ' 🍻'}
                </span>
                <span className="font-semibold">{won(s.total)}</span>
              </div>
            ))}
          </div>
          {preview.lateCount > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              🕑 지각 부담금 {won(preview.latePenaltyEach)}/인 반영됨
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="w-full rounded-xl bg-brand py-3.5 font-bold text-white disabled:opacity-50"
      >
        {saving ? '저장 중…' : submitLabel}
      </button>
    </div>
  )
}

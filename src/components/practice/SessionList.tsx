'use client'

import { useState } from 'react'
import { partInfo } from '@/lib/practice/parts'
import type { SessionRow } from '@/lib/practice/sessions'

// 내 연습 기록 — 최근 3개만 보이고 나머지는 '더보기'
export default function SessionList({
  sessions,
  selectedId,
  onSelect,
  onDelete,
}: {
  sessions: SessionRow[]
  selectedId: string | null
  onSelect: (s: SessionRow) => void
  onDelete: (s: SessionRow) => void
}) {
  const [open, setOpen] = useState(false)
  const shown = open ? sessions : sessions.slice(0, 3)
  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">내 연습 기록</h2>
        <span className="text-xs text-zinc-500">나만 볼 수 있어요</span>
      </div>
      {sessions.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">아직 없어요. 연습하기를 끝까지 하면 자동으로 저장돼요.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {shown.map(s => {
            const tend = !s.calibrated ? '' : Math.abs(s.medianDev) <= 8 ? '박에 붙음' : s.medianDev < 0 ? '서두름' : '끌림'
            const on = s.id === selectedId
            return (
              <li key={s.id} className={`flex items-center gap-2 rounded-xl px-2 py-2 ${on ? 'bg-brand/10' : 'bg-surface-2'}`}>
                <button type="button" onClick={() => onSelect(s)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="text-lg">{partInfo(s.part).emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">
                      {new Date(s.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <span className="block truncate text-xs text-zinc-500">
                      {s.fromBar}~{s.toBar}마디 · 평균 오차 {Math.round(s.meanAbs)}ms{tend && ` · ${tend}`}
                    </span>
                  </span>
                  <span className={`shrink-0 text-lg font-extrabold ${s.accuracy >= 80 ? 'text-emerald-600' : s.accuracy >= 55 ? 'text-red-500' : 'text-red-700'}`}>
                    {s.accuracy}%
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="이 기록 지우기"
                  onClick={() => {
                    if (confirm('이 연습 기록을 지울까요?')) onDelete(s)
                  }}
                  className="shrink-0 px-1.5 text-sm text-zinc-400"
                >
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {sessions.length > 3 && (
        <button type="button" onClick={() => setOpen(v => !v)} className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-brand">
          {open ? '접기 ▲' : `더보기 (${sessions.length - 3}개 더) ▼`}
        </button>
      )}
    </section>
  )
}

'use client'

import { C } from './colors'

const accColor = (a: number) => (a >= 80 ? C.good : a >= 55 ? C.early : C.earlyBig)
// 녹음 중 검은 막대 위에선 밝은 색으로 (진한 빨강은 안 보인다)
const accColorDark = (a: number) => (a >= 80 ? '#34d399' : a >= 55 ? '#fca5a5' : '#f87171')

// 반복 연습 결과: [전체] [1바퀴] [2바퀴] … 고르기 (바퀴가 많으면 옆으로 밀어서)
export default function LapChips({
  laps,
  mean,
  selected,
  onSelect,
}: {
  laps: number[] // 바퀴별 정확도 (%)
  mean: number
  selected: number | 'all'
  onSelect: (v: number | 'all') => void
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="바퀴 고르기">
      <Chip on={selected === 'all'} onClick={() => onSelect('all')} label="전체" acc={mean} />
      {laps.map((a, k) => (
        <Chip key={k} on={selected === k} onClick={() => onSelect(k)} label={`${k + 1}바퀴`} acc={a} />
      ))}
    </div>
  )
}

function Chip({ on, onClick, label, acc }: { on: boolean; onClick: () => void; label: string; acc: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={`flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 leading-tight ${on ? 'bg-brand text-white' : 'bg-surface text-zinc-700'}`}
    >
      <span className="text-[11px] font-semibold">{label}</span>
      <span className="text-sm font-extrabold tabular-nums" style={on ? undefined : { color: accColor(acc) }}>
        {acc}%
      </span>
    </button>
  )
}

/** 녹음하며 반복하는 중: 다 돈 바퀴들의 대략 정확도 (최근 것만) */
export function LiveLapChips({ laps }: { laps: number[] }) {
  const from = Math.max(0, laps.length - 4) // 폰 폭에 맞게 최근 4바퀴만
  return (
    <div className="mt-2 flex items-center gap-1 overflow-hidden text-[11px]">
      <span className="shrink-0 opacity-60">지난 바퀴</span>
      {laps.slice(from).map((a, i) => (
        <span key={from + i} className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 font-semibold tabular-nums">
          <span className="opacity-60">{from + i + 1}</span> <span style={{ color: accColorDark(a) }}>{a}%</span>
        </span>
      ))}
    </div>
  )
}

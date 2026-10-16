'use client'

import { C, devColor, devLabel, signed } from './colors'
import { insights, INST_KO, type HitResult, type Summary } from '@/lib/practice/analysis'

// 연습 한 번의 피드백: 정확도·평균 오차·놓침, 한 줄 평, 흔들린 마디, 고른 마디의 음표별 오차
export default function Feedback({
  title,
  summary,
  relative,
  calibrated,
  rawMedian,
  onToggleRelative,
  hits,
  selectedBar,
  onSelectBar,
  onPlayOrig,
  onPlayMine,
  canPlayMine,
  onLoopBar,
  playing,
}: {
  title: string
  summary: Summary
  relative: boolean
  calibrated: boolean
  rawMedian: number
  onToggleRelative: (v: boolean) => void
  hits: HitResult[]
  selectedBar: number | null
  onSelectBar: (m: number) => void
  onPlayOrig?: (m: number) => void
  onPlayMine?: (m: number) => void
  canPlayMine: boolean
  onLoopBar?: (m: number) => void // 이 마디만 반복 연습 시작
  playing: string | null
}) {
  const sel = selectedBar
  const selHits = sel === null ? [] : hits.filter(h => h.m === sel && !h.roll)
  const selStat = summary.measures.find(x => x.m === sel)
  const offset = relative ? rawMedian : 0
  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-4xl font-extrabold"
          style={{ color: summary.accuracy >= 80 ? C.good : summary.accuracy >= 55 ? C.early : C.earlyBig }}
        >
          {summary.accuracy}%
        </span>
        <span className="text-sm text-zinc-500">{relative ? '내 평균 ±20ms 안에 친 비율' : '박 ±20ms 안에 친 비율'}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="평균 오차" value={`${Math.round(summary.meanAbs)}ms`} />
        <Stat label="놓친 타격" value={`${summary.missed}개`} />
        <Stat label="악보에 없는 타격" value={`${summary.extras}개`} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {insights(summary, relative).map((t, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-brand">•</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {summary.worst.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs text-zinc-500">흔들린 마디</span>
          {summary.worst.map(m => (
            <button key={m} type="button" onClick={() => onSelectBar(m)} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sel === m ? 'bg-brand text-white' : 'bg-surface-2 text-brand'}`}>
              {m}마디
            </button>
          ))}
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-xs font-semibold">
        <button
          type="button"
          disabled={!calibrated}
          onClick={() => onToggleRelative(false)}
          className={`rounded-lg py-2 disabled:opacity-40 ${!relative ? 'bg-surface shadow-sm' : 'text-zinc-500'}`}
        >
          메트로놈 기준
        </button>
        <button type="button" onClick={() => onToggleRelative(true)} className={`rounded-lg py-2 ${relative ? 'bg-surface shadow-sm' : 'text-zinc-500'}`}>
          내 평균 기준
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500">
        {!calibrated
          ? '소리 지연 측정 없이 한 연습이라 내 평균 박자를 기준으로 비교했어요.'
          : relative
            ? `내 평균(${signed(rawMedian)}ms)을 0으로 놓고 비교해요.`
            : '메트로놈 박에 대해 빨리/늦게 친 그대로예요.'}
      </p>

      {sel !== null && (
        <div className="mt-4 border-t border-surface-2 pt-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">{sel}마디</h3>
            {selStat && selStat.meanDev !== null && (
              <span className="text-sm font-semibold" style={{ color: devColor(selStat.meanDev) }}>
                평균 {devLabel(selStat.meanDev)}
              </span>
            )}
          </div>
          {(onPlayOrig || onPlayMine || onLoopBar) && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {onPlayOrig && (
                <button
                  type="button"
                  onClick={() => onPlayOrig(sel)}
                  className={`rounded-xl py-2.5 text-sm font-semibold ${playing === `orig-${sel}` ? 'bg-brand text-white' : 'bg-surface-2 text-brand'}`}
                >
                  ▶ 원곡 이 마디
                </button>
              )}
              {onPlayMine && (
                <button
                  type="button"
                  disabled={!canPlayMine}
                  onClick={() => onPlayMine(sel)}
                  className={`rounded-xl py-2.5 text-sm font-semibold disabled:opacity-40 ${playing === `mine-${sel}` ? 'bg-brand text-white' : 'bg-surface-2 text-brand'}`}
                >
                  ▶ 내 연주 이 마디
                </button>
              )}
              {onLoopBar && (
                <button type="button" onClick={() => onLoopBar(sel)} className="col-span-2 rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-brand">
                  🔁 이 마디 반복 연습
                </button>
              )}
            </div>
          )}
          <ul className="mt-2 divide-y divide-surface-2">
            {selHits.map(h => {
              const d = h.dev === null ? null : h.dev - offset
              return (
                <li key={h.idx} className="flex items-center gap-2 py-1.5 text-sm">
                  <span className="w-14 shrink-0 whitespace-nowrap tabular-nums text-zinc-500">{fmtBeat(h.beat)}박</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{h.insts.map(i => INST_KO[i] ?? i).join('+')}</span>
                  <DevBar d={d} />
                  <span className="w-[5.5rem] shrink-0 text-right text-xs font-semibold" style={{ color: devColor(d) }}>
                    {devLabel(d)}
                  </span>
                </li>
              )
            })}
            {selHits.length === 0 && <li className="py-2 text-xs text-zinc-500">이 마디엔 칠 음표가 없어요.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}

function fmtBeat(b: number) {
  return String(Math.round((1 + b) * 1000) / 1000)
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-2 py-2">
      <div className="text-base font-bold">{value}</div>
      <div className="text-[11px] text-zinc-500">{label}</div>
    </div>
  )
}

function DevBar({ d }: { d: number | null }) {
  const W = 56
  const x = d === null ? null : Math.max(-60, Math.min(60, d))
  return (
    <svg width={W} height={12} className="shrink-0">
      <rect x={0} y={5} width={W} height={2} rx={1} fill="#e4e4e7" />
      <line x1={W / 2} x2={W / 2} y1={1} y2={11} stroke="#a1a1aa" strokeWidth={1} />
      {x !== null && <circle cx={W / 2 + (x / 60) * (W / 2 - 4)} cy={6} r={4} fill={devColor(d)} />}
    </svg>
  )
}

'use client'

import { C, devColor, devLabel, signed } from './colors'
import { insights, INST_KO, type HitResult, type Summary } from '@/lib/practice/analysis'
import type { Trouble } from '@/lib/practice/sessions'

const accColor = (a: number) => (a >= 80 ? C.good : a >= 55 ? C.early : C.earlyBig)

// 구간 반복 연습의 '전체' 보기: 바퀴 평균, 바퀴마다 정확도 흐름, 여러 바퀴에서 계속 틀린 음, 고른 마디의 바퀴별 오차
export default function LapOverview({
  title,
  lapAcc,
  mean,
  pooled,
  troubles,
  relative,
  calibrated,
  rawMedian,
  onToggleRelative,
  lapHits,
  selectedBar,
  onSelectBar,
  onSelectLap,
  onPlayOrig,
  onLoopBar,
  playing,
}: {
  title: string
  lapAcc: number[] // 바퀴별 정확도
  mean: number // 바퀴 평균
  pooled: Summary // 모든 바퀴를 합친 요약
  troubles: Trouble[]
  relative: boolean
  calibrated: boolean
  rawMedian: number
  onToggleRelative: (v: boolean) => void
  lapHits: HitResult[][] // 바퀴별 타격 결과
  selectedBar: number | null
  onSelectBar: (m: number) => void
  onSelectLap: (k: number) => void
  onPlayOrig?: (m: number) => void
  onLoopBar?: (m: number) => void
  playing: string | null
}) {
  const n = lapAcc.length
  const k = Math.max(1, Math.min(3, Math.floor(n / 2)))
  const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length))
  const first = avg(lapAcc.slice(0, k))
  const last = avg(lapAcc.slice(-k))
  const diff = last - first
  const offset = relative ? rawMedian : 0
  const sel = selectedBar
  // 고른 마디의 음표마다 바퀴별 오차
  const rows: { idx: number; beat: number; insts: string[]; devs: (number | null | undefined)[] }[] = []
  if (sel !== null) {
    const byIdx = new Map<number, (typeof rows)[number]>()
    lapHits.forEach((hs, lap) => {
      for (const h of hs) {
        if (h.m !== sel || h.roll) continue
        let r = byIdx.get(h.idx)
        if (!r) {
          r = { idx: h.idx, beat: h.beat, insts: h.insts, devs: Array(n).fill(undefined) }
          byIdx.set(h.idx, r)
          rows.push(r)
        }
        r.devs[lap] = h.dev === null ? null : h.dev - offset
      }
    })
    rows.sort((a, b) => a.beat - b.beat)
  }
  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="text-xs text-zinc-500">{title}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-4xl font-extrabold" style={{ color: accColor(mean) }}>
          {mean}%
        </span>
        <span className="text-sm text-zinc-500">{n}바퀴 평균 · {relative ? '내 평균 ±20ms' : '박 ±20ms'} 안에 친 비율</span>
      </div>

      {/* 바퀴마다 정확도 — 누르면 그 바퀴 보기 */}
      <div className="mt-3 flex h-20 items-end gap-0.5 rounded-xl bg-surface-2 px-2 pb-1 pt-2" aria-label="바퀴별 정확도">
        {lapAcc.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectLap(i)}
            title={`${i + 1}바퀴 ${a}%`}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
          >
            <span className="w-full max-w-7 rounded-t" style={{ height: `${Math.max(4, a)}%`, background: accColor(a), opacity: 0.85 }} />
            {(n <= 12 || i % 5 === 4 || i === 0) && <span className="mt-0.5 text-[9px] leading-none text-zinc-500 tabular-nums">{i + 1}</span>}
          </button>
        ))}
      </div>
      {n >= 2 && (
        <p className="mt-1.5 text-sm">
          {k === 1 ? '첫 바퀴' : `처음 ${k}바퀴`} {first}% → {k === 1 ? '마지막 바퀴' : `마지막 ${k}바퀴`} {last}%{' '}
          <span className={diff > 3 ? 'text-emerald-600' : diff < -3 ? 'text-red-500' : 'text-zinc-500'}>
            {diff > 3 ? '좋아지고 있어요 👍' : diff < -3 ? '뒤로 갈수록 떨어졌어요' : '비슷해요'}
          </span>
        </p>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="평균 오차" value={`${Math.round(pooled.meanAbs)}ms`} />
        <Stat label="바퀴당 놓침" value={`${Math.round((pooled.missed / Math.max(1, n)) * 10) / 10}개`} />
        <Stat label="악보에 없는 타격" value={`${pooled.extras}개`} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {insights(pooled, relative)
          .filter(t => !t.startsWith('가장 흔들린') && !t.startsWith('악보에 있는데'))
          .map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand">•</span>
              <span>{t}</span>
            </li>
          ))}
      </ul>

      <div className="mt-3">
        <div className="text-xs font-semibold text-zinc-500">여러 바퀴에서 계속 틀린 곳</div>
        {troubles.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">{n >= 2 ? '바퀴마다 계속 틀린 음은 없어요. 👏' : '두 바퀴 이상 돌면 보여드려요.'}</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {troubles.slice(0, 5).map(t => {
              const main = t.early >= t.late && t.early >= t.missed ? 'early' : t.late >= t.missed ? 'late' : 'missed'
              const cnt = main === 'early' ? t.early : main === 'late' ? t.late : t.missed
              return (
                <li key={t.idx}>
                  <button
                    type="button"
                    onClick={() => onSelectBar(t.m)}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${sel === t.m ? 'bg-brand/10' : 'bg-surface-2'}`}
                  >
                    <span className="shrink-0 font-semibold">
                      {t.m}마디 {fmtBeat(t.beat)}박
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{t.labels.map(l => INST_KO[l] ?? l).join('+')}</span>
                    <span className={`shrink-0 text-xs font-semibold ${main === 'early' ? 'text-red-500' : main === 'late' ? 'text-blue-600' : 'text-zinc-500'}`}>
                      {t.tries}바퀴 중 {cnt}번 {main === 'early' ? '빨리' : main === 'late' ? '늦게' : '놓침'}
                      {main !== 'missed' && t.meanDev !== null && ` (${signed(t.meanDev)}ms)`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

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
        악보에는 바퀴마다 친 것의 평균을 보여줘요 (절반 넘게 놓친 음은 놓침).{' '}
        {!calibrated ? '지연 측정 없이 해서 내 평균 박자를 기준으로 비교했어요.' : relative ? `내 평균(${signed(rawMedian)}ms)을 0으로 놓고 비교해요.` : ''}
      </p>

      {sel !== null && (
        <div className="mt-4 border-t border-surface-2 pt-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">{sel}마디 · 바퀴별</h3>
            <span className="text-[11px] text-zinc-500">점 하나 = 한 바퀴</span>
          </div>
          {(onPlayOrig || onLoopBar) && (
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
              {onLoopBar && (
                <button type="button" onClick={() => onLoopBar(sel)} className="rounded-xl bg-surface-2 py-2.5 text-sm font-semibold text-brand">
                  🔁 이 마디 반복 연습
                </button>
              )}
            </div>
          )}
          <ul className="mt-2 divide-y divide-surface-2">
            {rows.map(r => {
              const ds = r.devs.filter((d): d is number => typeof d === 'number')
              const played = ds.length
              const tries = r.devs.filter(d => d !== undefined).length
              const mean = played && played * 2 >= tries ? ds.reduce((x, y) => x + y, 0) / played : null
              return (
                <li key={r.idx} className="py-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-14 shrink-0 whitespace-nowrap tabular-nums text-zinc-500">{fmtBeat(r.beat)}박</span>
                    <span className="min-w-0 flex-1 truncate text-[13px]">{r.insts.map(i => INST_KO[i] ?? i).join('+')}</span>
                    <span className="shrink-0 text-right text-xs font-semibold" style={{ color: devColor(mean) }}>
                      {mean === null ? (played ? '자주 놓침' : '놓침') : `평균 ${devLabel(mean)}`}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1 pl-16">
                    {r.devs.map((d, lap) =>
                      d === undefined ? null : (
                        <button
                          key={lap}
                          type="button"
                          onClick={() => onSelectLap(lap)}
                          title={`${lap + 1}바퀴: ${devLabel(d)}`}
                          aria-label={`${lap + 1}바퀴 ${devLabel(d)}`}
                          className="h-3 w-3 rounded-full"
                          style={d === null ? { border: `1.5px dashed ${C.missed}` } : { background: devColor(d) }}
                        />
                      ),
                    )}
                  </div>
                </li>
              )
            })}
            {rows.length === 0 && <li className="py-2 text-xs text-zinc-500">이 마디엔 칠 음표가 없어요.</li>}
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

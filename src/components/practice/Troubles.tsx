'use client'

import { INST_KO } from '@/lib/practice/analysis'
import type { Trouble } from '@/lib/practice/sessions'

// 3번 이상 연습하면: 여러 번 반복해서 틀린 곳
export default function Troubles({
  troubles,
  count,
  tries,
  trend,
  showHeat,
  onToggleHeat,
  onSelectBar,
  onLoopBar,
}: {
  troubles: Trouble[]
  count: number // 연습(기록) 수
  tries: number // 친 횟수 — 구간 반복 기록은 한 바퀴가 한 번
  trend: number[] // 오래된 → 최근 정확도
  showHeat: boolean
  onToggleHeat: (v: boolean) => void
  onSelectBar: (m: number) => void
  onLoopBar?: (m: number) => void // 이 마디만 반복 연습 시작
}) {
  const bars = byBar(troubles)
  const last = trend.slice(-5)
  const diff = last.length >= 2 ? last[last.length - 1] - last[0] : 0
  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">자주 틀리는 곳</h2>
        <span className="text-xs text-zinc-500">{tries === count ? `최근 ${count}번 연습 기준` : `최근 ${count}번 연습(반복 포함 ${tries}번) 기준`}</span>
      </div>
      {last.length >= 2 && (
        <p className="mt-1 text-sm">
          정확도 {last.map(v => `${v}%`).join(' → ')}{' '}
          <span className={diff > 3 ? 'text-emerald-600' : diff < -3 ? 'text-red-500' : 'text-zinc-500'}>
            {diff > 3 ? '좋아지고 있어요 👍' : diff < -3 ? '조금 떨어졌어요' : '비슷해요'}
          </span>
        </p>
      )}
      {troubles.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">여러 번 반복해서 틀린 곳은 없어요. 👏</p>
      ) : (
        <>
          <ul className="mt-2 space-y-1.5">
            {bars.slice(0, 5).map(g => (
              <li key={g.m} className="flex items-stretch gap-1.5">
                <button type="button" onClick={() => onSelectBar(g.m)} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-left text-sm">
                  <span className="shrink-0 font-semibold">
                    {g.m}마디{g.items.length === 1 && ` ${fmtBeat(g.items[0].beat)}박`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                    {g.insts.join('·')}
                    {g.items.length > 1 && ` · ${g.items.length}곳`}
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${g.main === 'early' ? 'text-red-500' : g.main === 'late' ? 'text-blue-600' : 'text-zinc-500'}`}>
                    {g.label}
                  </span>
                </button>
                {onLoopBar && (
                  <button
                    type="button"
                    onClick={() => onLoopBar(g.m)}
                    aria-label={`${g.m}마디 반복 연습`}
                    title={`${g.m}마디만 반복 연습`}
                    className="shrink-0 rounded-xl bg-surface-2 px-2.5 text-sm font-semibold text-brand"
                  >
                    🔁
                  </button>
                )}
              </li>
            ))}
          </ul>
          {bars.length > 5 && <p className="mt-1.5 text-xs text-zinc-500">그 밖에 {bars.slice(5).map(g => g.m).join(', ')}마디</p>}
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showHeat} onChange={e => onToggleHeat(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />
            악보에 주황색으로 표시하기
          </label>
        </>
      )}
    </section>
  )
}

type Main = 'early' | 'late' | 'missed'

// 같은 마디에서 틀린 음들은 한 줄로 묶는다 (한 마디를 통째로 서두르면 음마다 줄이 생기지 않게)
function byBar(troubles: Trouble[]) {
  const map = new Map<number, Trouble[]>()
  for (const t of troubles) map.set(t.m, [...(map.get(t.m) ?? []), t])
  const out = [...map.entries()].map(([m, items]) => {
    items.sort((a, b) => a.beat - b.beat)
    const early = items.reduce((x, t) => x + t.early, 0)
    const late = items.reduce((x, t) => x + t.late, 0)
    const missed = items.reduce((x, t) => x + t.missed, 0)
    const main: Main = early >= late && early >= missed ? 'early' : late >= missed ? 'late' : 'missed'
    const devs = items.filter(t => t.meanDev !== null && (main === 'early' ? t.meanDev < 0 : t.meanDev > 0)).map(t => t.meanDev as number)
    const mean = devs.length ? Math.round(devs.reduce((x, y) => x + y, 0) / devs.length) : null
    const tries = Math.max(...items.map(t => t.tries))
    let label: string
    if (items.length === 1) {
      const t = items[0]
      const n = main === 'early' ? t.early : main === 'late' ? t.late : t.missed
      label = `${t.tries}번 중 ${n}번 ${main === 'early' ? '빨리' : main === 'late' ? '늦게' : '놓침'}`
    } else label = `자주 ${main === 'early' ? '빨라요' : main === 'late' ? '늦어요' : '놓쳐요'}`
    if (main !== 'missed' && mean !== null) label += ` (${mean > 0 ? '+' : ''}${mean}ms)`
    const insts = [...new Set(items.flatMap(t => t.labels.map(l => INST_KO[l] ?? l)))]
    const severity = items.reduce((x, t) => x + Math.max(t.early, t.late, t.missed) / t.tries, 0)
    return { m, items, main, label, insts, severity, tries }
  })
  return out.sort((a, b) => b.severity - a.severity || a.m - b.m)
}

function fmtBeat(b: number) {
  return String(Math.round((1 + b) * 100) / 100)
}

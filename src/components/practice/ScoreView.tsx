'use client'

// 앱이 직접 그리는 연습 악보 (박 간격이 일정한 '리듬게임' 식 배치).
// 악보 음표는 검은색, 내가 친 소리는 빨리 = 반투명 빨강 / 늦게 = 반투명 파랑으로 겹쳐 그린다.
// 재생 중엔 진행선이 지나가고, 그 줄이 화면에 보이도록 따라 내려간다.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GOOD_MS } from '@/lib/practice/analysis'
import {
  DRUM_DOWN,
  DRUM_POS,
  DRUM_XHEAD,
  keyAlterations,
  keySigPositions,
  spell,
  staffPos,
  type NoteEvent,
  type Onset,
  type PartScore,
} from '@/lib/practice/score'

export const EARLY = '#ef4444'
export const LATE = '#3b82f6'
export const EXAG = 3 // 차이를 3배로 키워서 그린다 (실제 크기면 몇 px 밖에 안 됨)

export interface HitMark {
  dev: number | null // ms (+ 늦게, - 빨리), null = 놓침
}

interface Props {
  score: PartScore
  onsets: Onset[]
  bpm: number
  beatsPerBar: number
  fromBar: number
  toBar: number
  marks?: Map<number, HitMark> // onset idx → 결과
  extras?: number[] // 악보에 없는 타격 (박, 1마디 1박 = 0)
  heat?: Map<number, number> // 마디 → 0~1 (자주 틀리는 정도)
  selectedBar?: number | null
  onSelectBar?: (m: number) => void
  playhead?: () => number | null // 지금 박 (1마디 1박 = 0), 재생 중이 아니면 null
  follow?: boolean
  range?: { from: number; to: number } | null // 반복 연습 구간 (마디) — 테두리로 표시
}

const HS = 3.5 // 반 칸 (px) — 줄 간격 7px
const STAFF_H = HS * 8

interface Geo {
  width: number
  barsPerRow: number
  barW: number
  rows: { bars: number[]; y: number; h: number }[]
  rowH: number
  staffTop: number // 줄 안에서 (첫) 오선 맨 윗줄 y
  staff2Top: number // 큰보표 아래 오선
  lead: number // 줄 첫 마디의 왼쪽 여백 (조표 자리)
  total: number
}

// 오선 위아래로 멀리 나가는 음(덧줄)이 있으면 그만큼 줄 사이를 벌린다
function pitchedPad(score: PartScore, fromBar: number, toBar: number, bpb: number): { top: number; bot: number } {
  if (score.type !== 'pitched') return { top: 0, bot: 0 }
  const lo = (fromBar - 1) * bpb
  const hi = toBar * bpb
  let minPos = 0
  let maxPos = 8
  for (const e of score.events) {
    if (e.b < lo - 1e-6 || e.b >= hi - 1e-6) continue
    const sp = spell(score.clef === 'treble8' ? e.p + 12 : e.p, score.keySig)
    const bass = score.clef === 'bass' || (score.clef === 'grand' && (e.h ?? (e.p >= 60 ? 0 : 1)) === 1)
    const pos = staffPos(sp.step, sp.octave, bass ? 'bass' : 'treble')
    if (score.clef !== 'grand' || !bass) minPos = Math.min(minPos, pos)
    if (score.clef !== 'grand' || bass) maxPos = Math.max(maxPos, pos)
  }
  return { top: Math.max(0, -minPos - 4) * HS, bot: Math.max(0, maxPos - 16) * HS }
}

function layout(
  width: number,
  fromBar: number,
  toBar: number,
  type: PartScore['type'],
  grand: boolean,
  pad: { top: number; bot: number },
  keySig: number,
): Geo {
  const barsPerRow = width < 440 ? 2 : width < 600 ? 3 : 4 // 폰 가로(600px 넘음)면 4마디
  const barW = (width - 4) / barsPerRow
  const staffTop = (type === 'drums' ? 38 : 34) + pad.top
  const staff2Top = grand ? staffTop + STAFF_H + 44 : staffTop
  const rowH = (grand ? staff2Top + STAFF_H + 34 : staffTop + STAFF_H + (type === 'drums' ? 40 : 34)) + pad.bot
  const rows: Geo['rows'] = []
  for (let m = fromBar, i = 0; m <= toBar; m += barsPerRow, i++) {
    const bars = []
    for (let k = m; k < m + barsPerRow && k <= toBar; k++) bars.push(k)
    rows.push({ bars, y: i * rowH, h: rowH })
  }
  const lead = 10 + (keySig ? Math.abs(keySig) * 5 + 8 : 0)
  return { width, barsPerRow, barW, rows, rowH, staffTop, staff2Top, lead, total: rows.length * rowH }
}

export default function ScoreView(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  const grand = p.score.type === 'pitched' && p.score.clef === 'grand'
  const bpb = p.beatsPerBar
  const pad = useMemo(() => pitchedPad(p.score, p.fromBar, p.toBar, bpb), [p.score, p.fromBar, p.toBar, bpb])
  const keySig = p.score.type === 'pitched' ? p.score.keySig : 0
  const g = useMemo(
    () => (width ? layout(width, p.fromBar, p.toBar, p.score.type, grand, pad, keySig) : null),
    [width, p.fromBar, p.toBar, p.score.type, grand, pad, keySig],
  )

  // 박 → (줄, x)
  const xOf = useCallback((geo: Geo, beat: number) => {
    const m = Math.floor(beat / bpb + 1e-9) + 1
    const ri = Math.floor((m - p.fromBar) / geo.barsPerRow)
    const ci = (m - p.fromBar) % geo.barsPerRow
    const inBar = beat - (m - 1) * bpb
    const pad = ci === 0 ? geo.lead : 10
    return { ri, x: 2 + ci * geo.barW + pad + (inBar / bpb) * (geo.barW - pad - 6) }
  }, [bpb, p.fromBar])

  // 진행선: 화면 갱신 없이 rAF 로 위치만 옮긴다
  useEffect(() => {
    if (!g || !p.playhead) return
    let raf = 0
    let lastRow = -1
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const el = lineRef.current
      if (!el) return
      const beat = p.playhead?.() ?? null
      if (beat === null || beat < (p.fromBar - 1) * bpb || beat >= p.toBar * bpb) {
        el.style.display = 'none'
        return
      }
      const { ri, x } = xOf(g, beat)
      const row = g.rows[ri]
      if (!row) return
      el.style.display = 'block'
      el.style.transform = `translate(${x}px, ${row.y + 4}px)`
      el.style.height = `${row.h - 8}px`
      if (p.follow && ri !== lastRow) {
        lastRow = ri
        const top = (wrapRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY + row.y
        window.scrollTo({ top: Math.max(0, top - window.innerHeight * 0.3), behavior: 'smooth' })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, p.playhead, p.follow, p.fromBar, p.toBar])

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {g && (
        <>
          <svg width={g.width} height={g.total} className="block">
            <Background g={g} fromBar={p.fromBar} bpb={bpb} heat={p.heat} selectedBar={p.selectedBar} onSelectBar={p.onSelectBar} />
            <StaticNotes score={p.score} onsets={p.onsets} g={g} fromBar={p.fromBar} toBar={p.toBar} bpb={bpb} xOf={xOf} />
            <Overlay
              score={p.score}
              onsets={p.onsets}
              g={g}
              bpm={p.bpm}
              bpb={bpb}
              fromBar={p.fromBar}
              toBar={p.toBar}
              marks={p.marks}
              extras={p.extras}
              xOf={xOf}
            />
          </svg>
          <div
            ref={lineRef}
            className="pointer-events-none absolute left-0 top-0 w-[3px] rounded-full bg-[#7c3aed] shadow-[0_0_8px_#7c3aed]"
            style={{ display: 'none', marginLeft: -1 }}
          />
        </>
      )}
    </div>
  )
}

// ───────── 오선·마디선·마디 번호 (고른 마디/자주 틀리는 마디 칠하기) ─────────
const Background = memo(function Background({
  g,
  fromBar,
  bpb,
  heat,
  selectedBar,
  onSelectBar,
}: {
  g: Geo
  fromBar: number
  bpb: number
  heat?: Map<number, number>
  selectedBar?: number | null
  onSelectBar?: (m: number) => void
}) {
  const staves = g.staff2Top !== g.staffTop ? [g.staffTop, g.staff2Top] : [g.staffTop]
  return (
    <g>
      {g.rows.map((row, ri) => (
        <g key={ri} transform={`translate(0 ${row.y})`}>
          {row.bars.map((m, ci) => {
            const x0 = 2 + ci * g.barW
            const h = heat?.get(m) ?? 0
            return (
              <g
                key={m}
                onClick={() => onSelectBar?.(m)}
                role={onSelectBar ? 'button' : undefined}
                aria-label={`${m}마디`}
                className={onSelectBar ? 'cursor-pointer' : undefined}
              >
                <rect x={x0} y={4} width={g.barW} height={row.h - 8} fill={selectedBar === m ? '#7c3aed' : h > 0 ? '#f97316' : 'transparent'} opacity={selectedBar === m ? 0.1 : h > 0 ? 0.08 + 0.22 * h : 1} rx={4} />
                        <text x={x0 + 3} y={14} fontSize={9} fill="#a1a1aa">
                  {m}
                </text>
                {/* 박 눈금 */}
                {Array.from({ length: bpb }, (_, k) => {
                  const padL = ci === 0 ? g.lead : 10
                  const x = x0 + padL + (k / bpb) * (g.barW - padL - 6)
                  return <line key={k} x1={x} x2={x} y1={g.staffTop - 6} y2={g.staffTop - 3} stroke="#d4d4d8" strokeWidth={1} />
                })}
                <line x1={x0 + g.barW} x2={x0 + g.barW} y1={staves[0]} y2={staves[staves.length - 1] + STAFF_H} stroke="#a1a1aa" strokeWidth={1} />
                {ci === 0 && <line x1={x0} x2={x0} y1={staves[0]} y2={staves[staves.length - 1] + STAFF_H} stroke="#a1a1aa" strokeWidth={1} />}
              </g>
            )
          })}
          {staves.map(top =>
            [0, 1, 2, 3, 4].map(k => (
              <line
                key={`${top}-${k}`}
                x1={2}
                x2={2 + row.bars.length * g.barW}
                y1={top + k * HS * 2}
                y2={top + k * HS * 2}
                stroke="#a1a1aa"
                strokeWidth={0.8}
              />
            )),
          )}
        </g>
      ))}
    </g>
  )
})

type XOf = (g: Geo, beat: number) => { ri: number; x: number }

// ───────── 악보 음표 (검은색) — 결과가 바뀌어도 다시 그리지 않는다 ─────────
const StaticNotes = memo(function StaticNotes({
  score,
  onsets,
  g,
  fromBar,
  toBar,
  bpb,
  xOf,
}: {
  score: PartScore
  onsets: Onset[]
  g: Geo
  fromBar: number
  toBar: number
  bpb: number
  xOf: XOf
}) {
  const lo = (fromBar - 1) * bpb
  const hi = toBar * bpb
  if (score.type === 'drums') return <DrumNotes score={score} onsets={onsets.filter(o => o.b >= lo - 1e-6 && o.b < hi - 1e-6)} g={g} bpb={bpb} xOf={xOf} />
  return <PitchedNotes score={score} g={g} lo={lo} hi={hi} xOf={xOf} />
})

function DrumHead({ x, y, inst, color = '#18181b', opacity = 1 }: { x: number; y: number; inst: string; color?: string; opacity?: number }) {
  if (DRUM_XHEAD.has(inst)) {
    const r = 3.2
    return (
      <g opacity={opacity} stroke={color} strokeWidth={1.6} strokeLinecap="round">
        <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} />
        <line x1={x - r} y1={y + r} x2={x + r} y2={y - r} />
        {inst === 'crash' && <line x1={x - r - 1.5} x2={x + r + 1.5} y1={y} y2={y} strokeWidth={1} />}
      </g>
    )
  }
  return <ellipse cx={x} cy={y} rx={4.1} ry={3.1} transform={`rotate(-20 ${x} ${y})`} fill={color} opacity={opacity} />
}

function DrumNotes({ score, onsets, g, bpb, xOf }: { score: Extract<PartScore, { type: 'drums' }>; onsets: Onset[]; g: Geo; bpb: number; xOf: XOf }) {
  // 성부별(위: 심벌·스네어·탐 / 아래: 킥) 박마다 묶어서 기둥·들보를 그린다
  const els: React.ReactNode[] = []
  for (const voiceDown of [false, true]) {
    const vo = onsets
      .map(o => ({ o, insts: o.labels.filter(l => DRUM_DOWN.has(l) === voiceDown) }))
      .filter(v => v.insts.length)
    // 다음 같은 성부 타격까지 길이 (박)
    const durs = vo.map((v, i) => (i + 1 < vo.length ? vo[i + 1].o.b - v.o.b : bpb))
    let i = 0
    while (i < vo.length) {
      const beatIdx = Math.floor(vo[i].o.b + 1e-6)
      let j = i
      while (j + 1 < vo.length && Math.floor(vo[j + 1].o.b + 1e-6) === beatIdx) j++
      const group = vo.slice(i, j + 1)
      const gd = durs.slice(i, j + 1).map((d, k) => Math.min(d, beatIdx + 1 - group[k].o.b))
      const pts = group.map(v => {
        const { ri, x } = xOf(g, v.o.b)
        const ys = v.insts.map(n => g.rows[ri].y + g.staffTop + (DRUM_POS[n] ?? 3) * HS)
        return { ri, x, ys, insts: v.insts, roll: v.o.roll }
      })
      // 머리
      pts.forEach((pt, k) =>
        pt.insts.forEach((n, q) => {
          els.push(<DrumHead key={`h${voiceDown}${i}-${k}-${q}`} x={pt.x} y={pt.ys[q]} inst={n} />)
          if (n === 'hihat-open') els.push(<circle key={`o${voiceDown}${i}-${k}-${q}`} cx={pt.x} cy={pt.ys[q] - 9} r={2.2} fill="none" stroke="#18181b" strokeWidth={0.9} />)
        }),
      )
      // 기둥
      const sx = (pt: (typeof pts)[0]) => (voiceDown ? pt.x - 3.6 : pt.x + 3.6)
      const tipLen = 22
      const beamY = voiceDown ? Math.max(...pts.map(pt => Math.max(...pt.ys))) + tipLen : Math.min(...pts.map(pt => Math.min(...pt.ys))) - tipLen
      const sameRow = pts.every(pt => pt.ri === pts[0].ri)
      pts.forEach((pt, k) => {
        const from = voiceDown ? Math.min(...pt.ys) : Math.max(...pt.ys)
        const to = group.length > 1 && sameRow ? beamY : voiceDown ? Math.max(...pt.ys) + tipLen : Math.min(...pt.ys) - tipLen
        els.push(<line key={`s${voiceDown}${i}-${k}`} x1={sx(pt)} x2={sx(pt)} y1={from} y2={to} stroke="#18181b" strokeWidth={1.1} />)
        if (pt.roll) {
          for (let q = 0; q < 3; q++) {
            const yy = (from + to) / 2 + (voiceDown ? 1 : -1) * q * 4
            els.push(<line key={`r${i}-${k}-${q}`} x1={sx(pt) - 3} x2={sx(pt) + 3} y1={yy + 2} y2={yy - 2} stroke="#18181b" strokeWidth={1.4} />)
          }
        }
      })
      // 들보 / 꼬리
      const dir = voiceDown ? -1 : 1
      if (group.length > 1 && sameRow) {
        els.push(<line key={`b1${voiceDown}${i}`} x1={sx(pts[0])} x2={sx(pts[pts.length - 1])} y1={beamY} y2={beamY} stroke="#18181b" strokeWidth={3} />)
        for (const level of [2, 3]) {
          const lim = level === 2 ? 0.26 : 0.13
          const y = beamY + dir * (level - 1) * 4.5
          for (let k = 0; k < pts.length; k++) {
            if (gd[k] > lim) continue
            const nextShort = k + 1 < pts.length && gd[k + 1] <= lim
            const prevShort = k > 0 && gd[k - 1] <= lim
            if (nextShort) els.push(<line key={`b${level}${voiceDown}${i}-${k}`} x1={sx(pts[k])} x2={sx(pts[k + 1])} y1={y} y2={y} stroke="#18181b" strokeWidth={3} />)
            else if (!prevShort) {
              const stub = k === pts.length - 1 ? -6 : 6
              els.push(<line key={`bs${level}${voiceDown}${i}-${k}`} x1={sx(pts[k])} x2={sx(pts[k]) + stub} y1={y} y2={y} stroke="#18181b" strokeWidth={3} />)
            }
          }
        }
      } else {
        pts.forEach((pt, k) => {
          const d = gd[k]
          const flags = d <= 0.13 ? 3 : d <= 0.26 ? 2 : d < 0.99 ? 1 : 0
          const tip = voiceDown ? Math.max(...pt.ys) + tipLen : Math.min(...pt.ys) - tipLen
          for (let q = 0; q < flags; q++) {
            const y0 = tip + dir * q * 4.5
            els.push(
              <path
                key={`f${voiceDown}${i}-${k}-${q}`}
                d={`M ${sx(pt)} ${y0} q 6 ${dir * 4} 5 ${dir * 11}`}
                stroke="#18181b"
                strokeWidth={1.6}
                fill="none"
              />,
            )
          }
        })
      }
      i = j + 1
    }
  }
  return <g>{els}</g>
}

// 음높이 악보: 머리 + 길이 꼬리 (기둥·들보 없이 박 간격으로 리듬을 보여준다)
function PitchedNotes({ score, g, lo, hi, xOf }: { score: Extract<PartScore, { type: 'pitched' }>; g: Geo; lo: number; hi: number; xOf: XOf }) {
  const els: React.ReactNode[] = []
  const alts = keyAlterations(score.keySig)
  const evs = score.events.filter(e => e.b >= lo - 1e-6 && e.b < hi - 1e-6)
  // 줄 머리: 음자리표 대신 이름 + 조표
  const staves: { top: number; clef: 'treble' | 'bass' }[] =
    score.clef === 'grand' ? [{ top: g.staffTop, clef: 'treble' }, { top: g.staff2Top, clef: 'bass' }] : [{ top: g.staffTop, clef: score.clef === 'bass' ? 'bass' : 'treble' }]
  g.rows.forEach((row, ri) =>
    staves.forEach((st, si) => {
      const ks = keySigPositions(score.keySig, st.clef)
      ks.forEach((k, q) =>
        els.push(
          <text key={`ks${ri}-${si}-${q}`} x={14 + q * 5} y={row.y + st.top + k.pos * HS + 3.5} fontSize={10} fill="#71717a">
            {k.sharp ? '♯' : '♭'}
          </text>,
        ),
      )
    }),
  )
  const posOf = (e: NoteEvent) => {
    const written = score.clef === 'treble8' ? e.p + 12 : e.p
    const sp = spell(written, score.keySig)
    const clef: 'treble' | 'bass' = score.clef === 'grand' ? ((e.h ?? (e.p >= 60 ? 0 : 1)) === 0 ? 'treble' : 'bass') : score.clef === 'bass' ? 'bass' : 'treble'
    const top = score.clef === 'grand' && clef === 'bass' ? g.staff2Top : g.staffTop
    return { pos: staffPos(sp.step, sp.octave, clef), top, acc: sp.alter !== alts[sp.step] ? sp.alter : null }
  }
  // 같은 시점 음은 붙은 음(2도)이면 옆으로 비킨다
  // 기타 스트로크처럼 줄마다 몇 ms 씩 어긋난 음도 0.06박 안이면 한 화음으로 (첫 음 자리에 세로로)
  const byOnset: { b: number; items: { e: NoteEvent; pos: number; top: number; acc: number | null }[] }[] = []
  for (const e of [...evs].sort((a, b) => a.b - b.b)) {
    const last = byOnset[byOnset.length - 1]
    if (last && e.b - last.b < 0.06) last.items.push({ e, ...posOf(e) })
    else byOnset.push({ b: e.b, items: [{ e, ...posOf(e) }] })
  }
  let n = 0
  for (const { b: cb, items: arr } of byOnset) {
    arr.sort((a, b) => a.top - b.top || b.pos - a.pos)
    let prev: { pos: number; top: number; shifted: boolean } | null = null
    for (const it of arr) {
      if (prev && prev.top === it.top && prev.pos === it.pos) continue // 같은 음 겹침
      const { ri, x } = xOf(g, cb)
      const rowY = g.rows[ri]?.y ?? 0
      const shifted: boolean = !!prev && prev.top === it.top && Math.abs(prev.pos - it.pos) === 1 && !prev.shifted
      const hx = x + (shifted ? 8 : 0)
      const y = rowY + it.top + it.pos * HS
      // 길이 꼬리 (같은 줄 안에서만)
      const end = xOf(g, Math.min(it.e.b + it.e.d, hi) - 1e-6)
      const tailEnd = end.ri === ri ? end.x : 2 + g.rows[ri].bars.length * g.barW - 2
      if (tailEnd - hx > 6) els.push(<rect key={`t${n}`} x={hx + 3} y={y - 1.2} width={tailEnd - hx - 3} height={2.4} rx={1.2} fill="#18181b" opacity={0.18} />)
      // 덧줄
      for (let lp = -2; lp >= it.pos; lp -= 2) els.push(<line key={`l${n}-${lp}`} x1={hx - 6} x2={hx + 6} y1={rowY + it.top + lp * HS} y2={rowY + it.top + lp * HS} stroke="#71717a" strokeWidth={0.8} />)
      for (let lp = 10; lp <= it.pos; lp += 2) els.push(<line key={`l${n}-${lp}`} x1={hx - 6} x2={hx + 6} y1={rowY + it.top + lp * HS} y2={rowY + it.top + lp * HS} stroke="#71717a" strokeWidth={0.8} />)
      els.push(<ellipse key={`h${n}`} cx={hx} cy={y} rx={4.1} ry={3.1} transform={`rotate(-20 ${hx} ${y})`} fill={it.e.d >= 2 ? 'none' : '#18181b'} stroke="#18181b" strokeWidth={it.e.d >= 2 ? 1.3 : 0} />)
      if (it.acc !== null)
        els.push(
          <text key={`a${n}`} x={hx - 11} y={y + 3.5} fontSize={10} fill="#18181b">
            {it.acc === 1 ? '♯' : it.acc === -1 ? '♭' : '♮'}
          </text>,
        )
      prev = { pos: it.pos, top: it.top, shifted }
      n++
    }
  }
  return <g>{els}</g>
}

// ───────── 내가 친 소리 겹쳐 그리기 ─────────
function Overlay({
  score,
  onsets,
  g,
  bpm,
  bpb,
  fromBar,
  toBar,
  marks,
  extras,
  xOf,
}: {
  score: PartScore
  onsets: Onset[]
  g: Geo
  bpm: number
  bpb: number
  fromBar: number
  toBar: number
  marks?: Map<number, HitMark>
  extras?: number[]
  xOf: XOf
}) {
  if (!marks && !extras) return null
  const els: React.ReactNode[] = []
  const lo = (fromBar - 1) * bpb
  const hi = toBar * bpb
  // ms → px (EXAG 배로 키움)
  const pxPerMs = ((g.barW - 16) / bpb / ((60 / bpm) * 1000)) * EXAG
  const ys = (o: Onset, ri: number): number[] => {
    const rowY = g.rows[ri].y
    if (score.type === 'drums') return o.labels.map(n => rowY + g.staffTop + (DRUM_POS[n] ?? 3) * HS)
    return o.notes.map(i => {
      const e = score.events[i]
      const written = score.clef === 'treble8' ? e.p + 12 : e.p
      const sp = spell(written, score.keySig)
      const bass = score.clef === 'bass' || (score.clef === 'grand' && (e.h ?? (e.p >= 60 ? 0 : 1)) === 1)
      return rowY + (score.clef === 'grand' && bass ? g.staff2Top : g.staffTop) + staffPos(sp.step, sp.octave, bass ? 'bass' : 'treble') * HS
    })
  }
  for (const o of onsets) {
    if (o.b < lo - 1e-6 || o.b >= hi - 1e-6 || o.roll) continue
    const mk = marks?.get(o.idx)
    if (!mk) continue
    const { ri, x } = xOf(g, o.b)
    if (!g.rows[ri]) continue
    const yy = ys(o, ri)
    if (mk.dev === null) {
      // 놓침: 회색 점선 동그라미
      const top = Math.min(...yy)
      const bot = Math.max(...yy)
      els.push(<rect key={`m${o.idx}`} x={x - 6} y={top - 6} width={12} height={bot - top + 12} rx={6} fill="none" stroke="#a1a1aa" strokeWidth={1.3} strokeDasharray="2 2" />)
      continue
    }
    if (Math.abs(mk.dev) <= GOOD_MS) continue // 정확: 악보 그대로 (검은 음표)
    const dx = Math.max(-28, Math.min(28, mk.dev * pxPerMs))
    const color = mk.dev < 0 ? EARLY : LATE
    const opacity = 0.35 + 0.5 * Math.min(1, (Math.abs(mk.dev) - GOOD_MS) / 60)
    yy.forEach((y, q) =>
      els.push(
        score.type === 'drums' ? (
          <DrumHead key={`g${o.idx}-${q}`} x={x + dx} y={y} inst={o.labels[q]} color={color} opacity={opacity} />
        ) : (
          <ellipse key={`g${o.idx}-${q}`} cx={x + dx} cy={y} rx={4.6} ry={3.5} transform={`rotate(-20 ${x + dx} ${y})`} fill={color} opacity={opacity} />
        ),
      ),
    )
    // 얼마나 어긋났는지 가는 선
    const yTop = Math.min(...yy)
    els.push(<line key={`d${o.idx}`} x1={x} x2={x + dx} y1={yTop - 7} y2={yTop - 7} stroke={color} strokeWidth={1.5} opacity={opacity} strokeLinecap="round" />)
  }
  for (const [k, b] of (extras ?? []).entries()) {
    if (b < lo || b >= hi) continue
    const { ri, x } = xOf(g, b)
    if (!g.rows[ri]) continue
    els.push(<circle key={`e${k}`} cx={x} cy={g.rows[ri].y + g.staffTop - 12} r={2.6} fill="#71717a" opacity={0.6} />)
  }
  return <g>{els}</g>
}

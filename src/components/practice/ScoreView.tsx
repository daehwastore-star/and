'use client'

// 연습 악보 — engrave() 로 음표·쉼표를 정리하고 VexFlow 로 진짜 악보처럼 그린다 (vexRender.ts).
// 악보 SVG 는 악보·구간·폭이 바뀔 때만 다시 그리고, 그 위에 같은 좌표계의 SVG 를 한 겹 더 얹어
// 내가 친 소리(빨리 = 반투명 빨강 왼쪽 / 늦게 = 반투명 파랑 오른쪽)·놓친 음·마디 칠하기를 그린다.
// 재생 중엔 진행선이 실제 음표 자리를 따라 지나가고, 그 줄이 화면에 보이도록 따라 내려간다.

import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { GOOD_MS } from '@/lib/practice/analysis'
import { engrave } from '@/lib/practice/engrave'
import type { Onset, PartScore } from '@/lib/practice/score'
import { locate, ScoreRenderer, speedUpVexFlow, unitsPerBeat, type Layout } from './vexRender'

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

type VexModule = typeof import('vexflow/bravura')

// VexFlow(+Bravura 글꼴)는 연습 화면에서 처음 악보를 그릴 때 한 번만 받는다
let vexLoading: Promise<VexModule> | null = null
function loadVexFlow(): Promise<VexModule> {
  if (!vexLoading) {
    vexLoading = import('vexflow/bravura')
      .then(async VF => {
        // 글꼴이 다 받아진 뒤에 재야 음표 폭·위치가 맞는다
        await document.fonts.load('30px Bravura')
        speedUpVexFlow(VF)
        return VF
      })
      .catch(e => {
        vexLoading = null
        throw e
      })
  }
  return vexLoading
}

const MAX_SHIFT_PX = 28 // 겹쳐 그린 음표가 옆으로 가는 최대 거리

export default function ScoreView(p: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [VF, setVF] = useState<VexModule | null>(null)
  const [failed, setFailed] = useState(false)
  const [lay, setLay] = useState<{ layout: Layout; v: number } | null>(null)
  const layRef = useRef<Layout | null>(null)
  useEffect(() => {
    layRef.current = lay?.layout ?? null
  }, [lay])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    // 스크롤바 등으로 1~2px 흔들릴 때마다 다시 그리지 않게
    const ro = new ResizeObserver(() => setWidth(w => (Math.abs(el.clientWidth - w) > 2 ? el.clientWidth : w)))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let alive = true
    loadVexFlow().then(
      v => alive && setVF(() => v),
      () => alive && setFailed(true),
    )
    return () => {
      alive = false
    }
  }, [])

  // 악보 그리기 — 악보·구간·폭이 바뀔 때만. 클릭한 화면이 먼저 바뀌게 한 박자 쉬고 시작해서,
  // 음표 정리(engrave) → 위에서부터 줄 단위로 조금씩 (긴 곡도 화면이 멈추지 않게)
  const { score, onsets, fromBar, toBar } = p
  const bpb = p.beatsPerBar
  useEffect(() => {
    const host = hostRef.current
    if (!VF || !width || !host) return
    let r: ScoreRenderer | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let v = 0
    let stopped = false
    const run = () => {
      if (stopped) return
      try {
        if (!r) {
          // 바로 앞 마디도 같이 정리: 붙임줄이 이어져 들어오는지 보려고
          const from = Math.max(1, fromBar - 1)
          const all = engrave(score, { beatsPerBar: bpb, fromBar: from, toBar: Math.max(fromBar, toBar) })
          const lead = from === fromBar ? undefined : all.measures[0]
          const eng = lead ? { ...all, measures: all.measures.slice(1) } : all
          r = new ScoreRenderer(VF, host, eng, score, onsets, width, lead)
          timer = setTimeout(run, 0)
          return
        }
        const done = r.step(v === 0 ? 30 : 20)
        if (v === 0) setFailed(false)
        setLay({ layout: r.layout, v: ++v })
        if (!done) timer = setTimeout(run, 0)
      } catch (e) {
        console.error(e)
        setFailed(true)
      }
    }
    timer = setTimeout(run, 0)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [VF, width, score, onsets, bpb, fromBar, toBar])

  // 진행선: 화면 갱신 없이 rAF 로 위치만 옮긴다 (박 → 실제 음표 자리 꺾은선)
  const { playhead, follow } = p
  useEffect(() => {
    if (!playhead) return
    let raf = 0
    let lastRow = -1
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const el = lineRef.current
      const L = layRef.current
      if (!el) return
      const beat = playhead()
      const loc = beat === null || !L ? null : locate(L, beat)
      if (!L || !loc) {
        el.style.display = 'none'
        return
      }
      const s = L.scale
      el.style.display = 'block'
      el.style.transform = `translate(${loc.x * s}px, ${(loc.row.top + 2) * s}px)`
      el.style.height = `${Math.max(12, (loc.row.bottom - loc.row.top - 4) * s)}px`
      if (follow && loc.mg.row !== lastRow) {
        lastRow = loc.mg.row
        const top = (wrapRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY + loc.row.top * s
        window.scrollTo({ top: Math.max(0, top - window.innerHeight * 0.3), behavior: 'smooth' })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playhead, follow])

  const L = lay?.layout
  const v = lay?.v ?? 0
  const vb = L ? `0 0 ${L.width} ${Math.max(1, L.height)}` : undefined
  const svgStyle = L ? { width: L.width * L.scale, height: Math.max(1, L.height) * L.scale } : undefined

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      {L && (
        <svg className="pointer-events-none absolute left-0 top-0" viewBox={vb} style={svgStyle} aria-hidden>
          <Tints layout={L} v={v} heat={p.heat} selectedBar={p.selectedBar} range={p.range} />
        </svg>
      )}
      {/* 악보 줄마다 <svg> 를 vexRender 가 직접 넣는다 (React 는 자식을 건드리지 않음) */}
      <div ref={hostRef} className="relative" />
      {!L && !failed && <p className="py-8 text-center text-xs text-zinc-400">악보 그리는 중…</p>}
      {failed && <p className="py-8 text-center text-xs text-amber-700">악보를 그리지 못했어요. 새로고침해 주세요.</p>}
      {L && (
        <svg className="pointer-events-none absolute left-0 top-0" viewBox={vb} style={svgStyle}>
          <Marks layout={L} v={v} onsets={p.onsets} bpm={p.bpm} marks={p.marks} extras={p.extras} />
          {p.onSelectBar && <HitAreas layout={L} v={v} onSelectBar={p.onSelectBar} />}
        </svg>
      )}
      {playhead && (
        <div
          ref={lineRef}
          className="pointer-events-none absolute left-0 top-0 w-[3px] rounded-full bg-[#7c3aed] shadow-[0_0_8px_#7c3aed]"
          style={{ display: 'none', marginLeft: -1.5 }}
        />
      )}
    </div>
  )
}

// ───────── 마디 칠하기: 자주 틀리는 마디(주황) · 고른 마디(보라) · 반복 구간(보라 띠 + 테두리) ─────────
// v: 줄을 더 그릴 때마다 바뀌는 번호 (layout 은 같은 객체에 채워지므로 memo 가 다시 그리게)
const Tints = memo(function Tints({
  layout: L,
  heat,
  selectedBar,
  range,
}: {
  layout: Layout
  v: number
  heat?: Map<number, number>
  selectedBar?: number | null
  range?: { from: number; to: number } | null
}) {
  const els: React.ReactNode[] = []
  const pad = 2
  for (const mg of L.measures.values()) {
    const row = L.rows[mg.row]
    const h = heat?.get(mg.m) ?? 0
    const sel = selectedBar === mg.m
    if (!h && !sel) continue
    els.push(
      <rect
        key={`t${mg.m}`}
        x={mg.x0}
        y={row.top + pad}
        width={mg.x1 - mg.x0}
        height={row.bottom - row.top - pad * 2}
        rx={6}
        fill={sel ? '#7c3aed' : '#f97316'}
        opacity={sel ? 0.1 : 0.08 + 0.22 * h}
      />,
    )
  }
  if (range) {
    // 줄마다 구간에 든 마디를 한 덩어리로
    L.rows.forEach((row, ri) => {
      const ms = row.ms.filter(m => m >= range.from && m <= range.to).map(m => L.measures.get(m)!)
      if (!ms.length) return
      const x0 = Math.min(...ms.map(g => g.x0))
      const x1 = Math.max(...ms.map(g => g.x1))
      els.push(
        <rect
          key={`r${ri}`}
          x={x0 + 1}
          y={row.top + pad}
          width={x1 - x0 - 2}
          height={row.bottom - row.top - pad * 2}
          rx={8}
          fill="#7c3aed"
          fillOpacity={0.06}
          stroke="#7c3aed"
          strokeOpacity={0.55}
          strokeWidth={2 / L.scale}
        />,
      )
    })
  }
  return <g>{els}</g>
})

// ───────── 내가 친 소리 겹쳐 그리기 ─────────
const Marks = memo(function Marks({
  layout: L,
  onsets,
  bpm,
  marks,
  extras,
}: {
  layout: Layout
  v: number
  onsets: Onset[]
  bpm: number
  marks?: Map<number, HitMark>
  extras?: number[]
}) {
  const byIdx = useMemo(() => new Map(onsets.map(o => [o.idx, o])), [onsets])
  if (!marks && !extras) return null
  const els: React.ReactNode[] = []
  const msPerBeat = 60000 / bpm
  const maxShift = MAX_SHIFT_PX / L.scale
  const sw = 1 / L.scale
  for (const [idx, mk] of marks ?? []) {
    const og = L.onsets.get(idx)
    const o = byIdx.get(idx)
    if (!og || !o || o.roll) continue
    if (mk.dev === null) {
      // 놓침: 그 음표머리들을 회색 점선으로 감싼다
      const x0 = Math.min(...og.heads.map(h => h.x)) - 4
      const x1 = Math.max(...og.heads.map(h => h.x + h.w)) + 4
      els.push(
        <rect
          key={`m${idx}`}
          x={x0}
          y={og.top}
          width={x1 - x0}
          height={og.bottom - og.top}
          rx={6}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth={1.6 * sw}
          strokeDasharray={`${3 * sw} ${2.5 * sw}`}
        />,
      )
      continue
    }
    if (Math.abs(mk.dev) <= GOOD_MS) continue // 정확: 악보 그대로 (검은 음표)
    // ms → x: 그 자리에서 실제로 1박이 차지하는 폭 기준 (음표가 촘촘한 곳은 덜, 넓은 곳은 더 움직인다)
    const m = Math.floor(o.b / L.bpb + 1e-9) + 1
    const mg = L.measures.get(m)
    if (!mg) continue
    const upb = unitsPerBeat(mg, o.b - (m - 1) * L.bpb, L.bpb)
    const dx = Math.max(-maxShift, Math.min(maxShift, ((mk.dev * upb) / msPerBeat) * EXAG))
    const color = mk.dev < 0 ? EARLY : LATE
    const opacity = 0.35 + 0.5 * Math.min(1, (Math.abs(mk.dev) - GOOD_MS) / 60)
    const top = og.heads.reduce((a, h) => (h.y < a.y ? h : a), og.heads[0])
    // 진짜 음표머리에서 겹친 음표까지 가는 선 (맨 위 음 높이)
    els.push(
      <line
        key={`d${idx}`}
        x1={top.x + top.w / 2}
        x2={top.x + top.w / 2 + dx}
        y1={top.y}
        y2={top.y}
        stroke={color}
        strokeWidth={1.4 * sw}
        strokeLinecap="round"
        opacity={opacity}
      />,
    )
    og.heads.forEach((h, q) =>
      els.push(
        <text key={`g${idx}-${q}`} x={h.x + dx} y={h.y} fontFamily="Bravura" fontSize={h.size} fill={color} opacity={opacity}>
          {h.glyph}
        </text>,
      ),
    )
  }
  for (const [k, b] of (extras ?? []).entries()) {
    const loc = locate(L, b)
    if (!loc) continue
    els.push(<circle key={`e${k}`} cx={loc.x} cy={loc.row.staffTop - 9} r={3} fill="#71717a" opacity={0.6} />)
  }
  return <g>{els}</g>
})

// ───────── 마디 누르기 (투명한 칸) ─────────
const HitAreas = memo(function HitAreas({ layout: L, onSelectBar }: { layout: Layout; v: number; onSelectBar: (m: number) => void }) {
  return (
    <g>
      {[...L.measures.values()].map(mg => {
        const row = L.rows[mg.row]
        return (
          <rect
            key={mg.m}
            x={mg.x0}
            y={row.top}
            width={mg.x1 - mg.x0}
            height={row.bottom - row.top}
            fill="transparent"
            className="pointer-events-auto cursor-pointer"
            role="button"
            aria-label={`${mg.m}마디`}
            onClick={() => onSelectBar(mg.m)}
          />
        )
      })}
    </g>
  )
})

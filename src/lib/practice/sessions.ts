// 연습 기록: 서버 저장 형식 ↔ 화면에서 쓰는 결과, 그리고 '자주 틀리는 곳' 집계
import { GOOD_MS, summarize, type HitResult, type MatchResult } from './analysis'
import type { Onset } from './score'

export interface SessionRow {
  id: string
  part: string
  fromBar: number
  toBar: number
  bpm: number
  accuracy: number
  medianDev: number
  meanAbs: number
  missed: number
  extras: number
  calibrated: boolean
  result: string
  createdAt: string
}

// result JSON: { v, scoreHash, latencyMs, hits: [[onset idx, dev ms | null], ...], extras: [박, ...] }
export interface SessionData {
  v: 1
  scoreHash: string
  latencyMs: number
  hits: [number, number | null][]
  extras: number[]
}

export function encodeResult(match: MatchResult, o: { scoreHash: string; latencyMs: number; fromBar: number; beatsPerBar: number; bpm: number }): string {
  const spb = 60 / o.bpm
  const base = (o.fromBar - 1) * o.beatsPerBar
  const data: SessionData = {
    v: 1,
    scoreHash: o.scoreHash,
    latencyMs: o.latencyMs,
    hits: match.hits.map(h => [h.idx, h.dev === null ? null : Math.round(h.dev * 10) / 10]),
    extras: match.extras.map(t => Math.round((base + t / spb) * 1000) / 1000),
  }
  return JSON.stringify(data)
}

export function decodeResult(s: SessionRow): SessionData | null {
  try {
    const d = JSON.parse(s.result)
    return d && d.v === 1 ? d : null
  } catch {
    return null
  }
}

/** 저장된 기록 → summarize 가 읽는 MatchResult (악보가 그대로일 때만) */
export function toMatch(d: SessionData, onsets: Onset[], o: { fromBar: number; beatsPerBar: number; bpm: number }): MatchResult {
  const spb = 60 / o.bpm
  const base = (o.fromBar - 1) * o.beatsPerBar
  const hits: HitResult[] = []
  for (const [idx, dev] of d.hits) {
    const on = onsets[idx]
    if (!on) continue
    const m = Math.floor(on.b / o.beatsPerBar + 1e-6) + 1
    const t = (on.b - base) * spb
    hits.push({ idx, m, beat: on.b - (m - 1) * o.beatsPerBar, t, insts: on.labels, roll: !!on.roll, played: dev === null ? null : t + dev / 1000, dev })
  }
  return { hits, extras: d.extras.map(b => (b - base) * spb) }
}

export function sessionSummary(s: SessionRow, d: SessionData, onsets: Onset[], beatsPerBar: number) {
  const match = toMatch(d, onsets, { fromBar: s.fromBar, beatsPerBar, bpm: s.bpm })
  return { match, summary: summarize(match, s.fromBar, s.toBar, s.calibrated ? 0 : s.medianDev, (beatsPerBar * 60) / s.bpm) }
}

export interface Trouble {
  idx: number
  m: number
  beat: number
  labels: string[]
  tries: number // 이 음이 들어간 연습 횟수
  early: number
  late: number
  missed: number
  meanDev: number | null
}

/**
 * 같은 악보로 한 연습 기록들을 모아, 여러 번 반복해서 틀린 음을 찾는다.
 * 기록마다 자기 평균(지연 보정 안 한 기록)이나 0(보정한 기록)을 기준으로 판정.
 */
export function frequentTroubles(rows: { s: SessionRow; d: SessionData }[], onsets: Onset[], beatsPerBar: number): Trouble[] {
  const acc = new Map<number, { tries: number; early: number; late: number; missed: number; devs: number[] }>()
  for (const { s, d } of rows) {
    const offset = s.calibrated ? 0 : s.medianDev
    for (const [idx, dev] of d.hits) {
      const on = onsets[idx]
      if (!on || on.roll) continue
      const a = acc.get(idx) ?? { tries: 0, early: 0, late: 0, missed: 0, devs: [] }
      a.tries++
      if (dev === null) a.missed++
      else {
        const v = dev - offset
        a.devs.push(v)
        if (v < -GOOD_MS) a.early++
        else if (v > GOOD_MS) a.late++
      }
      acc.set(idx, a)
    }
  }
  const out: Trouble[] = []
  for (const [idx, a] of acc) {
    const bad = a.early + a.late + a.missed
    if (a.tries < 3 || bad < 2 || bad / a.tries < 0.6) continue
    const on = onsets[idx]
    const m = Math.floor(on.b / beatsPerBar + 1e-6) + 1
    out.push({
      idx,
      m,
      beat: on.b - (m - 1) * beatsPerBar,
      labels: on.labels,
      tries: a.tries,
      early: a.early,
      late: a.late,
      missed: a.missed,
      meanDev: a.devs.length ? Math.round(a.devs.reduce((x, y) => x + y, 0) / a.devs.length) : null,
    })
  }
  // 많이·한쪽으로 꾸준히 틀린 순서
  return out.sort((x, y) => Math.max(y.early, y.late, y.missed) / y.tries - Math.max(x.early, x.late, x.missed) / x.tries || y.tries - x.tries)
}

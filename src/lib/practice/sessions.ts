// 연습 기록: 서버 저장 형식 ↔ 화면에서 쓰는 결과, 그리고 '자주 틀리는 곳' 집계
import { GOOD_MS, summarize, type HitResult, type MatchResult } from './analysis'
import type { Onset } from './score'

export interface SessionRow {
  id: string
  part: string
  fromBar: number
  toBar: number // 반복 연습이면 반복 구간 끝 마디
  bpm: number
  // 반복 연습(v2)이면 바퀴별 정확도의 평균 (바퀴마다 똑같이 한 표) — 한 번 친 것(v1)은 그 정확도 그대로
  accuracy: number
  medianDev: number // 반복 연습이면 모든 바퀴를 합친 중앙값 (지연 보정 없는 기록은 이걸 '내 평균'으로 쓴다)
  meanAbs: number // 반복 연습이면 모든 바퀴의 타격을 합친 평균
  missed: number // 반복 연습이면 모든 바퀴 합계
  extras: number // 〃
  calibrated: boolean
  result: string
  createdAt: string
}

// 한 바퀴(또는 한 번 친 것)의 결과: hits [[onset idx, 오차 ms | null]], extras [박 (1마디 1박 = 0, 첫 바퀴 자리로 옮긴 값)]
export interface LapData {
  hits: [number, number | null][]
  extras: number[]
  to?: number // 덜 돌고 멈춘 마지막 바퀴만: 실제로 분석한 끝 마디 (없으면 기록의 toBar)
}

// 저장 형식 (result JSON)
//  v1 한 번 친 것:  { v: 1, scoreHash, latencyMs, hits, extras }
//  v2 구간 반복:    { v: 2, scoreHash, latencyMs, laps: [{ hits, extras, to? }, ...] } — 녹음 한 번에 기록 하나, 바퀴는 그 안에
// 읽을 때는 둘 다 laps 로 맞춘다 (v1 = 한 바퀴)
export interface SessionData {
  v: 1 | 2
  scoreHash: string
  latencyMs: number
  laps: LapData[]
  loop: boolean // 구간 반복 기록인지 (v2)
}

export interface LapResult {
  match: MatchResult // 시각은 그 바퀴 시작(구간 첫 마디 1박) = 0
  toBar: number
}

interface EncodeOpts {
  scoreHash: string
  latencyMs: number
  fromBar: number
  beatsPerBar: number
  bpm: number
}

function encodeLap(match: MatchResult, o: EncodeOpts): LapData {
  const spb = 60 / o.bpm
  const base = (o.fromBar - 1) * o.beatsPerBar
  return {
    hits: match.hits.map(h => [h.idx, h.dev === null ? null : Math.round(h.dev * 10) / 10]),
    extras: match.extras.map(t => Math.round((base + t / spb) * 1000) / 1000),
  }
}

/** 한 번 친 연습 (v1) */
export function encodeResult(match: MatchResult, o: EncodeOpts): string {
  const lap = encodeLap(match, o)
  return JSON.stringify({ v: 1, scoreHash: o.scoreHash, latencyMs: o.latencyMs, hits: lap.hits, extras: lap.extras })
}

/** 구간 반복 연습 (v2). o.toBar = 반복 구간 끝 — 덜 돈 바퀴만 to 를 따로 적는다 */
export function encodeLoopResult(laps: LapResult[], o: EncodeOpts & { toBar: number }): string {
  return JSON.stringify({
    v: 2,
    scoreHash: o.scoreHash,
    latencyMs: o.latencyMs,
    laps: laps.map(l => ({ ...encodeLap(l.match, o), ...(l.toBar !== o.toBar ? { to: l.toBar } : {}) })),
  })
}

export function decodeResult(s: SessionRow): SessionData | null {
  try {
    const d = JSON.parse(s.result)
    if (d && d.v === 1 && Array.isArray(d.hits))
      return { v: 1, scoreHash: d.scoreHash, latencyMs: d.latencyMs, laps: [{ hits: d.hits, extras: d.extras ?? [] }], loop: false }
    if (d && d.v === 2 && Array.isArray(d.laps) && d.laps.length)
      return {
        v: 2,
        scoreHash: d.scoreHash,
        latencyMs: d.latencyMs,
        laps: (d.laps as LapData[]).map(l => ({ hits: l.hits ?? [], extras: l.extras ?? [], ...(l.to ? { to: l.to } : {}) })),
        loop: true,
      }
  } catch {}
  return null
}

/** 저장된 한 바퀴 → summarize 가 읽는 MatchResult (악보가 그대로일 때만) */
export function toMatch(d: LapData, onsets: Onset[], o: { fromBar: number; beatsPerBar: number; bpm: number }): MatchResult {
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

/** 저장된 기록의 바퀴들 (한 번 친 기록은 바퀴 하나) */
export function sessionLaps(s: SessionRow, d: SessionData, onsets: Onset[], beatsPerBar: number): LapResult[] {
  return d.laps.map(l => ({ match: toMatch(l, onsets, { fromBar: s.fromBar, beatsPerBar, bpm: s.bpm }), toBar: l.to ?? s.toBar }))
}

/** 여러 바퀴를 한데 모은 결과 — 전체 중앙값·평균 오차·마디별 합계용 (시각은 모두 바퀴 시작 기준이라 겹친다) */
export function mergeLaps(laps: LapResult[]): MatchResult {
  return { hits: laps.flatMap(l => l.match.hits), extras: laps.flatMap(l => l.match.extras) }
}

/**
 * 반복 연습 한 번의 기록 값.
 * 정확도 = 바퀴별 정확도의 평균 (바퀴마다 한 표 — 덜 돈 마지막 바퀴도 한 바퀴로), 평균 오차 = 모든 바퀴 타격을 합쳐서,
 * 놓침·추가 타격 = 모든 바퀴 합계, medianDev = 모든 바퀴를 합친 중앙값 (지연 보정 없으면 이걸 '내 평균' 기준으로).
 */
export function loopStats(laps: LapResult[], o: { fromBar: number; toBar: number; calibrated: boolean; barLen: number }) {
  const all = mergeLaps(laps)
  const raw = summarize(all, o.fromBar, o.toBar, 0, o.barLen)
  const off = o.calibrated ? 0 : raw.medianDev
  const pooled = summarize(all, o.fromBar, o.toBar, off, o.barLen)
  const each = laps.map(l => summarize(l.match, o.fromBar, l.toBar, off, o.barLen))
  return {
    accuracy: Math.round(each.reduce((x, s) => x + s.accuracy, 0) / Math.max(1, each.length)),
    medianDev: raw.medianDev,
    meanAbs: pooled.meanAbs,
    missed: each.reduce((x, s) => x + s.missed, 0),
    extras: each.reduce((x, s) => x + s.extras, 0),
  }
}

export interface Trouble {
  idx: number
  m: number
  beat: number
  labels: string[]
  tries: number // 이 음을 친 횟수 (반복 연습은 한 바퀴가 한 번)
  early: number
  late: number
  missed: number
  meanDev: number | null
}

/** 한 번 친 것. offset = 판정 기준(ms) — 지연 보정 안 한 기록은 자기 평균, 보정한 기록은 0 */
export interface Try {
  hits: [number, number | null][]
  offset: number
}

/** 저장된 기록들 → 친 횟수 단위 (반복 연습 기록은 바퀴마다 한 번) */
export function sessionTries(rows: { s: SessionRow; d: SessionData }[]): Try[] {
  return rows.flatMap(({ s, d }) => d.laps.map(l => ({ hits: l.hits, offset: s.calibrated ? 0 : s.medianDev })))
}

/**
 * 같은 악보로 친 것들을 모아, 여러 번 반복해서 틀린 음을 찾는다.
 * minTries: 이만큼 이상 친 음만 (기록 여러 개는 3번, 반복 연습 한 번 안에서는 바퀴 수에 맞춰 줄여 쓴다)
 */
export function frequentTroubles(tries: Try[], onsets: Onset[], beatsPerBar: number, minTries = 3): Trouble[] {
  const acc = new Map<number, { tries: number; early: number; late: number; missed: number; devs: number[] }>()
  for (const tr of tries) {
    for (const [idx, dev] of tr.hits) {
      const on = onsets[idx]
      if (!on || on.roll) continue
      const a = acc.get(idx) ?? { tries: 0, early: 0, late: 0, missed: 0, devs: [] }
      a.tries++
      if (dev === null) a.missed++
      else {
        const v = dev - tr.offset
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
    if (a.tries < minTries || bad < 2 || bad / a.tries < 0.6) continue
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

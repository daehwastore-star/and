'use client'

// 박자 체크: 녹음 분석 + 지연 측정값 보관 (연습 화면에서 쓴다)
import { detectOnsets, estimateBleed, estimateGlobalLag, matchHits, type BleedInfo, type ExpectedHit, type HitResult, type MatchResult } from './analysis'
import type { Recording } from './engine'
import type { LapResult } from './sessions'

export const LAT_KEY = 'drumPracticeLatency'

export function readJSON<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : null
  } catch {
    return null
  }
}
export function writeJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {}
}

/**
 * 녹음 분석. clickTimes: 같이 튼 클릭 시각(구간 첫 마디 1박 = 0, 카운트인은 음수).
 * 지연 측정이 없으면(latency=null) 친 소리와 악보가 가장 잘 겹치는 밀림을 찾아 맞춘다.
 */
export async function analyzeRecording(o: {
  expected: ExpectedHit[]
  rec: Recording
  gridOriginCtx: number
  latency: number | null
  bpm: number
  beatsPerBar: number
  countInBeats: number
  fromBar: number
  stoppedAtBar: number
  clickTimes: number[]
  metronomeAudible: boolean
  bleedScale?: number // 곡 중 메트로놈 음량 ÷ 카운트인 음량 (카운트인으로 잰 새는 소리를 곡 중 크기로)
  onProgress?: (p: number) => void
}): Promise<{ match: MatchResult; latency: number; calibrated: boolean; bleed: BleedInfo | null }> {
  const { rec, gridOriginCtx } = o
  const spb = 60 / o.bpm
  const barLen = o.beatsPerBar * spb
  const gridRel = gridOriginCtx - rec.startTime // 녹음 안에서 구간 첫 마디 1박 (초)
  const span = (o.stoppedAtBar - o.fromBar + 1) * barLen
  const guessLat = o.latency ?? 0
  let bleed: BleedInfo | null = null
  const onsets = await detectOnsets(rec.samples, rec.sampleRate, {
    from: gridRel + guessLat - o.countInBeats * spb - 0.2,
    to: gridRel + Math.max(guessLat, 0.45) + span + 0.4,
    onProgress: o.onProgress,
    // 스피커로 튼 반주가 마이크에 새어 들어온 건 빼고 찾는다
    reference: rec.reference,
    referenceLag: o.latency,
    quietTo: gridRel + guessLat - 0.03, // 카운트인 끝 (아직 안 칠 때) — 새는지는 여기까지로 판단
    onBleed: b => (bleed = b),
  })
  const exp = o.expected.filter(e => e.m <= o.stoppedAtBar)
  let lat = guessLat
  if (o.latency === null) {
    const raw = onsets.map(x => rec.startTime + x.time - gridOriginCtx)
    lat = estimateGlobalLag(exp.map(e => e.t), raw)
  }
  const played = onsets.map(x => rec.startTime + x.time - lat - gridOriginCtx)
  const strengths = onsets.map(x => x.strength)
  const countIn = o.clickTimes.filter(t => t < -0.01).slice(-o.countInBeats)
  const lv = o.metronomeAudible ? estimateBleed(played, strengths, countIn) : null
  const level = lv === null ? null : lv * (o.bleedScale ?? 1)
  const match = matchHits(exp, played, {
    weights: onsets.map(x => x.flux),
    strengths,
    clickTimes: o.metronomeAudible ? o.clickTimes : [],
    bleed: level === null ? undefined : { clickTimes: o.clickTimes, level },
    spanEnd: span + 0.1,
  })
  return { match, latency: lat, calibrated: o.latency !== null, bleed }
}

/** 중간에 멈췄을 때: 마지막으로 뭔가 친 마디까지만 (멈춘 뒤 빈 마디를 '놓침'으로 세지 않게) */
export function trimMatch(match: MatchResult, fromBar: number, stoppedAtBar: number, barLen: number): { match: MatchResult; toBar: number } {
  const playedBars = match.hits.filter(h => h.played !== null).map(h => h.m)
  const last = playedBars.length ? Math.max(...playedBars) : fromBar
  if (last >= stoppedAtBar) return { match, toBar: stoppedAtBar }
  const end = (last - fromBar + 1) * barLen
  return { match: { hits: match.hits.filter(h => h.m <= last), extras: match.extras.filter(t => t <= end) }, toBar: last }
}

// ───────── 구간 반복 연습 ─────────

// 반복 녹음 안전장치: 한 번에 40바퀴 또는 10분 중 먼저 닿는 쪽에서 멈춘다 (녹음이 메모리에 쌓이므로)
export const LOOP_MAX_LAPS = 40
export const LOOP_MAX_SEC = 600

export function loopLapLimit(loopLen: number): number {
  return Math.max(1, Math.min(LOOP_MAX_LAPS, Math.floor(LOOP_MAX_SEC / loopLen)))
}

/** 첫 바퀴 클릭(카운트인 포함, 구간 첫 마디 1박 = 0) → 바퀴마다 되풀이한 클릭. 카운트인은 첫 바퀴 앞에만 있다 */
export function loopClicks(clickTimes: number[], loopLen: number, laps: number): number[] {
  const out = clickTimes.filter(t => t < -0.01)
  const one = clickTimes.filter(t => t >= -0.01 && t < loopLen - 0.01)
  for (let k = 0; k < laps; k++) for (const t of one) out.push(t + k * loopLen)
  out.push(laps * loopLen)
  return out
}

/**
 * 구간 반복 녹음 분석: 녹음 전체에서 타격을 한 번만 찾고(바퀴마다 다시 훑지 않는다), 지연도 모든 바퀴로 한 번만 정한 뒤,
 * 바퀴를 이어 붙인 정답과 한꺼번에 짝지어(바퀴 경계에서 소리가 두 바퀴에 겹쳐 쓰이지 않게) 바퀴별로 나눈다.
 * laps = 끝까지 돈 바퀴, partialBars = 그 뒤 덜 돈 바퀴에서 다 지나간 마디 수 (1마디 이상이면 그 바퀴도 분석).
 * 돌려주는 바퀴마다 시각은 그 바퀴 시작 = 0 — 한 번 친 연습 결과와 똑같이 다룰 수 있다.
 */
export async function analyzeLoop(o: {
  expected: ExpectedHit[] // 한 바퀴 (구간 첫 마디 1박 = 0)
  rec: Recording
  gridOriginCtx: number // 첫 바퀴 구간 첫 마디 1박 (AudioContext 시각)
  latency: number | null
  bpm: number
  beatsPerBar: number
  countInBeats: number
  fromBar: number
  toBar: number
  loopLen: number
  laps: number
  partialBars: number
  clickTimes: number[] // 첫 바퀴 클릭 (카운트인 포함)
  metronomeAudible: boolean
  bleedScale?: number
  onProgress?: (p: number) => void
}): Promise<{ laps: LapResult[]; latency: number; calibrated: boolean; bleed: BleedInfo | null }> {
  const { rec, gridOriginCtx: g } = o
  const spb = 60 / o.bpm
  const barLen = o.beatsPerBar * spb
  const L = o.loopLen
  const nLaps = o.laps + (o.partialBars > 0 ? 1 : 0)
  const span = o.laps * L + o.partialBars * barLen
  const one = [...o.expected].sort((a, b) => a.t - b.t)
  const exp: ExpectedHit[] = []
  const lapOf: number[] = []
  for (let k = 0; k < nLaps; k++) {
    for (const e of one) {
      if (k >= o.laps && e.m >= o.fromBar + o.partialBars) continue
      exp.push({ ...e, t: e.t + k * L })
      lapOf.push(k)
    }
  }
  const real = exp.length
  // 멈춘 자리 바로 뒤 음표도 짝짓기에만 끼워 둔다 (결과는 버림) — 멈추기 직전에 친 다음 마디 첫 박이 앞 음표의 짝이나 '악보에 없는 타격'이 되지 않게
  if (one.length) {
    const inLap = one.find(e => e.t >= o.partialBars * barLen - 1e-6)
    exp.push(inLap ? { ...inLap, t: o.laps * L + inLap.t } : { ...one[0], t: (o.laps + 1) * L + one[0].t })
    lapOf.push(-1)
  }
  const gridRel = g - rec.startTime
  const guessLat = o.latency ?? 0
  let bleed: BleedInfo | null = null
  const onsets = await detectOnsets(rec.samples, rec.sampleRate, {
    from: gridRel + guessLat - o.countInBeats * spb - 0.2,
    to: gridRel + Math.max(guessLat, 0.45) + span + 0.4,
    onProgress: o.onProgress,
    // 스피커로 튼 반주가 마이크에 새어 들어온 건 빼고 찾는다
    reference: rec.reference,
    referenceLag: o.latency,
    quietTo: gridRel + guessLat - 0.03, // 카운트인 끝 (아직 안 칠 때) — 새는지는 여기까지로 판단
    onBleed: b => (bleed = b),
  })
  let lat = guessLat
  if (o.latency === null) lat = estimateGlobalLag(exp.slice(0, real).map(e => e.t), onsets.map(x => rec.startTime + x.time - g))
  const played = onsets.map(x => rec.startTime + x.time - lat - g)
  const strengths = onsets.map(x => x.strength)
  const clicks = loopClicks(o.clickTimes, L, nLaps)
  const countIn = clicks.filter(t => t < -0.01).slice(-o.countInBeats)
  const lv = o.metronomeAudible ? estimateBleed(played, strengths, countIn) : null
  const level = lv === null ? null : lv * (o.bleedScale ?? 1)
  const match = matchHits(exp, played, {
    weights: onsets.map(x => x.flux),
    strengths,
    clickTimes: o.metronomeAudible ? clicks : [],
    bleed: level === null ? undefined : { clickTimes: clicks, level },
    spanEnd: span + 0.1,
  })
  // 바퀴별로 나누기 (matchHits 는 정답을 시각 순서 그대로 돌려준다)
  const parts = Array.from({ length: nLaps }, () => ({ hits: [] as HitResult[], extras: [] as number[] }))
  match.hits.forEach((h, i) => {
    if (lapOf[i] < 0) return
    const sh = lapOf[i] * L
    parts[lapOf[i]].hits.push({ ...h, t: h.t - sh, played: h.played === null ? null : h.played - sh })
  })
  for (const p of match.extras) {
    const k = Math.max(0, Math.min(nLaps - 1, Math.floor(p / L)))
    parts[k].extras.push(p - k * L)
  }
  const out: LapResult[] = parts.map((m, k) => ({ match: m, toBar: k < o.laps ? o.toBar : o.fromBar + o.partialBars - 1 }))
  const anyPlayed = (r: LapResult) => r.match.hits.some(h => h.played !== null)
  // 덜 돈 마지막 바퀴: 한 번 친 연습을 중간에 멈췄을 때처럼 마지막으로 뭔가 친 마디까지만 (하나도 안 쳤으면 버린다)
  if (o.partialBars > 0) {
    const last = out[out.length - 1]
    if (anyPlayed(last) || out.length === 1) out[out.length - 1] = trimMatch(last.match, o.fromBar, last.toBar, barLen)
    else out.pop()
  }
  // 끝에 아무것도 안 친 바퀴(손 놓고 멈추기만 늦은 것)는 '다 놓침'으로 세지 않는다
  while (out.length > 1 && !anyPlayed(out[out.length - 1])) out.pop()
  return { laps: out, latency: lat, calibrated: o.latency !== null, bleed }
}

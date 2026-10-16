'use client'

// 박자 체크: 녹음 분석 + 지연 측정값 보관 (연습 화면에서 쓴다)
import { detectOnsets, estimateBleed, estimateGlobalLag, matchHits, type ExpectedHit, type MatchResult } from './analysis'
import type { Recording } from './engine'

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
}): Promise<{ match: MatchResult; latency: number; calibrated: boolean }> {
  const { rec, gridOriginCtx } = o
  const spb = 60 / o.bpm
  const barLen = o.beatsPerBar * spb
  const gridRel = gridOriginCtx - rec.startTime // 녹음 안에서 구간 첫 마디 1박 (초)
  const span = (o.stoppedAtBar - o.fromBar + 1) * barLen
  const guessLat = o.latency ?? 0
  const onsets = await detectOnsets(rec.samples, rec.sampleRate, {
    from: gridRel + guessLat - o.countInBeats * spb - 0.2,
    to: gridRel + Math.max(guessLat, 0.45) + span + 0.4,
    onProgress: o.onProgress,
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
  return { match, latency: lat, calibrated: o.latency !== null }
}

/** 중간에 멈췄을 때: 마지막으로 뭔가 친 마디까지만 (멈춘 뒤 빈 마디를 '놓침'으로 세지 않게) */
export function trimMatch(match: MatchResult, fromBar: number, stoppedAtBar: number, barLen: number): { match: MatchResult; toBar: number } {
  const playedBars = match.hits.filter(h => h.played !== null).map(h => h.m)
  const last = playedBars.length ? Math.max(...playedBars) : fromBar
  if (last >= stoppedAtBar) return { match, toBar: stoppedAtBar }
  const end = (last - fromBar + 1) * barLen
  return { match: { hits: match.hits.filter(h => h.m <= last), extras: match.extras.filter(t => t <= end) }, toBar: last }
}

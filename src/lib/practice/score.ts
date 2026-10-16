// 파트 악보 데이터 — 앱이 직접 그리는 악보와 박자 체크 정답의 원본.
// 박(beat)은 모두 '1마디 1박 = 0' 기준 4분음표 단위.
import type { ExpectedHit } from './analysis'

export interface DrumEvent {
  b: number
  n: string[] // kick, snare, hihat, hihat-open, ride, crash, tom1, tom2, floor, rim, hihat-foot
  roll?: boolean
}
export interface NoteEvent {
  b: number
  d: number
  p: number // MIDI (실제 소리 높이)
  h?: 0 | 1 // 키보드: 0 오른손(높은음자리) / 1 왼손(낮은음자리)
  slur?: boolean // 기타 벤딩·해머링처럼 새로 치지 않는 음 — 악보엔 그리고 박자 체크에선 뺀다
}
export type PartScore =
  | { type: 'drums'; events: DrumEvent[] }
  | { type: 'pitched'; clef: 'treble' | 'treble8' | 'bass' | 'grand'; keySig: number; events: NoteEvent[] }

// 저장 형식(JSON)은 짧게: drums [[b, "kick+hihat", 1?]], pitched [[b, d, p, h?, slur?]] (h 가 없으면 null)
export function parseScore(json: string): PartScore | null {
  try {
    const o = JSON.parse(json)
    if (o.type === 'drums')
      return { type: 'drums', events: (o.e as [number, string, number?][]).map(([b, n, r]) => ({ b, n: n.split('+'), ...(r ? { roll: true } : {}) })) }
    if (o.type === 'pitched')
      return {
        type: 'pitched',
        clef: o.clef,
        keySig: o.key ?? 0,
        events: (o.e as [number, number, number, (number | null)?, number?][]).map(([b, d, p, h, sl]) => ({
          b,
          d,
          p,
          ...(h != null ? { h: h as 0 | 1 } : {}),
          ...(sl ? { slur: true } : {}),
        })),
      }
  } catch {}
  return null
}

/** 악보가 바뀌었는지 알아보는 짧은 지문 (저장한 연습 기록이 지금 악보와 맞는지) */
export function scoreHash(json: string): string {
  let h = 2166136261
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export interface Onset {
  idx: number
  b: number // 시작 박
  labels: string[] // 악기 이름 또는 음 이름
  roll?: boolean
  notes: number[] // 이 시점에 시작하는 이벤트 번호들
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * 같은 순간에 시작하는 음들을 하나의 '타격 시점'으로 묶는다.
 * 기타 스트로크처럼 줄마다 몇 ms 씩 어긋난 음도 0.06박 안이면 한 번으로 본다.
 */
export function onsetsOf(score: PartScore): Onset[] {
  const evs = score.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !(e as NoteEvent).slur)
    .sort((a, b) => a.e.b - b.e.b)
  const out: Onset[] = []
  for (const { e, i } of evs) {
    const last = out[out.length - 1]
    const tol = score.type === 'drums' ? 0.01 : 0.06
    const label =
      score.type === 'drums' ? (e as DrumEvent).n : [PITCH_NAMES[(e as NoteEvent).p % 12] + (Math.floor((e as NoteEvent).p / 12) - 1)]
    if (last && e.b - last.b < tol) {
      last.notes.push(i)
      for (const l of label) if (!last.labels.includes(l)) last.labels.push(l)
      if ((e as DrumEvent).roll) last.roll = true
      continue
    }
    out.push({ idx: out.length, b: e.b, labels: [...label], notes: [i], ...((e as DrumEvent).roll ? { roll: true } : {}) })
  }
  return out
}

/** 연습 구간의 정답 타격 시점 (초, 구간 첫 마디 1박 = 0) */
export function expectedFromOnsets(onsets: Onset[], bpm: number, beatsPerBar: number, fromBar: number, toBar: number): ExpectedHit[] {
  const spb = 60 / bpm
  const lo = (fromBar - 1) * beatsPerBar
  const hi = toBar * beatsPerBar
  return onsets
    .filter(o => o.b >= lo - 1e-6 && o.b < hi - 1e-6)
    .map(o => {
      const m = Math.floor(o.b / beatsPerBar + 1e-6) + 1
      return { idx: o.idx, m, beat: o.b - (m - 1) * beatsPerBar, t: (o.b - lo) * spb, insts: o.labels, roll: !!o.roll }
    })
}

// ───────── 드럼 악보 그리기용 ─────────
// 오선 맨 윗줄 = 0, 아래로 반 칸씩 +1
export const DRUM_POS: Record<string, number> = {
  crash: -2,
  'hihat-open': -1,
  hihat: -1,
  ride: 0,
  tom1: 1,
  tom2: 2,
  snare: 3,
  rim: 3,
  floor: 5,
  kick: 7,
  'hihat-foot': 9,
}
export const DRUM_XHEAD = new Set(['crash', 'hihat', 'hihat-open', 'ride', 'rim', 'hihat-foot'])
export const DRUM_DOWN = new Set(['kick', 'hihat-foot']) // 아래 성부 (기둥 아래로)

// ───────── 음높이 악보 그리기용 ─────────
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6] // F C G D A E B (C=0 … B=6)
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3] // B E A D G C F
const STEP_SEMI = [0, 2, 4, 5, 7, 9, 11]

/** 조표에서 음이름(C=0…B=6)마다 붙는 변화 (+1 샵 / -1 플랫) */
export function keyAlterations(keySig: number): number[] {
  const alt = [0, 0, 0, 0, 0, 0, 0]
  if (keySig > 0) for (let i = 0; i < Math.min(7, keySig); i++) alt[SHARP_ORDER[i]] = 1
  if (keySig < 0) for (let i = 0; i < Math.min(7, -keySig); i++) alt[FLAT_ORDER[i]] = -1
  return alt
}

/** MIDI → (음이름 단계, 옥타브, 변화). 조표 쪽으로 이름을 붙인다 (샵 조면 샵, 플랫 조면 플랫) */
export function spell(midi: number, keySig: number): { step: number; octave: number; alter: number } {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  const alts = keyAlterations(keySig)
  // 조표 안의 음과 똑같으면 그 이름
  for (let s = 0; s < 7; s++) {
    if ((STEP_SEMI[s] + alts[s] + 12) % 12 === pc) {
      const oct = STEP_SEMI[s] + alts[s] < 0 ? octave + 1 : STEP_SEMI[s] + alts[s] > 11 ? octave - 1 : octave
      return { step: s, octave: oct, alter: alts[s] }
    }
  }
  // 아니면 제자리표 또는 샵/플랫
  const nat = STEP_SEMI.indexOf(pc)
  if (nat >= 0) return { step: nat, octave, alter: 0 }
  if (keySig >= 0) return { step: STEP_SEMI.indexOf(pc - 1), octave, alter: 1 }
  return { step: STEP_SEMI.indexOf((pc + 1) % 12), octave: pc === 11 ? octave + 1 : octave, alter: -1 }
}

/** 오선 위치 (맨 윗줄 = 0, 아래로 반 칸 +1). clef: treble 맨 윗줄 F5, bass A3 */
export function staffPos(step: number, octave: number, clef: 'treble' | 'bass'): number {
  const dia = octave * 7 + step
  const top = clef === 'treble' ? 5 * 7 + 3 : 3 * 7 + 5
  return top - dia
}

/** 조표 기호 자리 (높은음/낮은음자리) */
export function keySigPositions(keySig: number, clef: 'treble' | 'bass'): { pos: number; sharp: boolean }[] {
  const sharpTreble = [0, 3, -1, 2, 5, 1, 4]
  const flatTreble = [4, 1, 5, 2, 6, 3, 7]
  const shift = clef === 'bass' ? 2 : 0
  if (keySig > 0) return sharpTreble.slice(0, keySig).map(p => ({ pos: p + shift, sharp: true }))
  if (keySig < 0) return flatTreble.slice(0, -keySig).map(p => ({ pos: p + shift, sharp: false }))
  return []
}

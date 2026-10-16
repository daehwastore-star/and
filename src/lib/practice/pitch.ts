// 튜너: 마이크 소리에서 음높이 찾기 (YIN, de Cheveigné & Kawahara 2002) + 기타·베이스 조율 표

export interface PitchResult {
  hz: number
  clarity: number // 0~1, 클수록 또렷한 음
  rms: number
}

/** x 안의 기본 주파수. 소리가 작거나 음이 불분명하면 null */
export function detectPitch(x: Float32Array, sr: number, minHz = 30, maxHz = 1400): PitchResult | null {
  const N = x.length
  let e = 0
  for (let i = 0; i < N; i++) e += x[i] * x[i]
  const rms = Math.sqrt(e / N)
  if (rms < 0.004) return null
  const tauMin = Math.max(2, Math.floor(sr / maxHz))
  const tauMax = Math.min(Math.floor(sr / minHz), Math.floor(N / 2))
  const W = N - tauMax
  const d = new Float32Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0
    for (let j = 0; j < W; j++) {
      const v = x[j] - x[j + tau]
      sum += v * v
    }
    d[tau] = sum
  }
  // 누적 평균 정규화
  const dn = new Float32Array(tauMax + 1)
  dn[0] = 1
  let run = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau]
    dn[tau] = run > 0 ? (d[tau] * tau) / run : 1
  }
  const TH = 0.12
  let tau = -1
  for (let t = tauMin; t < tauMax; t++) {
    if (dn[t] < TH) {
      while (t + 1 < tauMax && dn[t + 1] < dn[t]) t++
      tau = t
      break
    }
  }
  if (tau < 0) {
    // 문턱 아래가 없으면 전체 최소값 (너무 흐리면 포기)
    let best = tauMin
    for (let t = tauMin; t < tauMax; t++) if (dn[t] < dn[best]) best = t
    if (dn[best] > 0.3) return null
    tau = best
  }
  // 포물선 보간
  const a = dn[tau - 1] ?? dn[tau]
  const b = dn[tau]
  const c = dn[tau + 1] ?? dn[tau]
  const den = a + c - 2 * b
  const shift = den !== 0 ? (a - c) / (2 * den) : 0
  const t = tau + Math.max(-1, Math.min(1, shift))
  return { hz: sr / t, clarity: Math.max(0, 1 - b), rms }
}

const NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

export function midiToHz(m: number, a4 = 440) {
  return a4 * Math.pow(2, (m - 69) / 12)
}
export function hzToMidi(hz: number, a4 = 440) {
  return 69 + 12 * Math.log2(hz / a4)
}
export function noteName(m: number, flats = false) {
  const r = Math.round(m)
  return `${(flats ? NAMES_FLAT : NAMES_SHARP)[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`
}

export interface Tuning {
  key: string
  label: string
  strings: number[] // 굵은 줄 → 얇은 줄 (MIDI)
  flats?: boolean
}

// 기타: 6번줄(굵은) → 1번줄
export const GUITAR_TUNINGS: Tuning[] = [
  { key: 'std', label: '표준', strings: [40, 45, 50, 55, 59, 64] },
  { key: 'half', label: '하프 스텝 다운', strings: [39, 44, 49, 54, 58, 63], flats: true },
  { key: 'dropd', label: '드롭 D', strings: [38, 45, 50, 55, 59, 64] },
  { key: 'whole', label: '온음 다운', strings: [38, 43, 48, 53, 57, 62] },
]
// 베이스: 4번줄(굵은) → 1번줄
export const BASS_TUNINGS: Tuning[] = [
  { key: 'std', label: '표준', strings: [28, 33, 38, 43] },
  { key: 'half', label: '하프 스텝 다운', strings: [27, 32, 37, 42], flats: true },
  { key: 'dropd', label: '드롭 D', strings: [26, 33, 38, 43] },
  { key: 'whole', label: '온음 다운', strings: [26, 31, 36, 41] },
]

/** 들리는 음에 가장 가까운 줄 (cents 기준) */
export function nearestString(midi: number, strings: number[]): number {
  let best = 0
  for (let i = 1; i < strings.length; i++) if (Math.abs(midi - strings[i]) < Math.abs(midi - strings[best])) best = i
  return best
}

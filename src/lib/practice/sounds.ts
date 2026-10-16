// 메트로놈·카운트인·지연 측정용 소리를 직접 합성한다 (DOM 없음).
// 클릭은 시작이 아주 날카로워야 녹음에서 정확히 잡히므로, 첫 샘플부터 최대 세기로 시작한다.

export type ClickKind = 'accent' | 'beat' | 'count' | 'cal'

export function clickSamples(sr: number, kind: ClickKind): Float32Array {
  const len = Math.round(sr * (kind === 'count' ? 0.05 : 0.04))
  const out = new Float32Array(len)
  // 결과가 매번 같도록 고정 시드 잡음
  let seed = 12345
  const noise = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return seed / 0x7fffffff - 1
  }
  if (kind === 'count') {
    // 드럼스틱 맞부딪는 소리 비슷하게: 고음 위주 잡음 + 짧은 울림
    let prev = 0
    for (let i = 0; i < len; i++) {
      const t = i / sr
      const n = noise()
      const hp = n - prev // 1차 고역 통과
      prev = n
      out[i] = (0.55 * hp + 0.45 * Math.sin(2 * Math.PI * 2600 * t)) * Math.exp(-t / 0.012) * 0.9
    }
    return out
  }
  const f = kind === 'accent' || kind === 'cal' ? 1900 : 1300
  for (let i = 0; i < len; i++) {
    const t = i / sr
    const click = i < sr * 0.001 ? noise() * 0.5 * (1 - i / (sr * 0.001)) : 0
    out[i] = (Math.sin(2 * Math.PI * f * t) * 0.8 + click) * Math.exp(-t / (kind === 'beat' ? 0.007 : 0.009))
  }
  return out
}

function addAt(dst: Float32Array, src: Float32Array, at: number, gain = 1) {
  const s = Math.round(at)
  for (let i = 0; i < src.length; i++) {
    const k = s + i
    if (k >= 0 && k < dst.length) dst[k] += src[i] * gain
  }
}

export interface MetronomeRender {
  samples: Float32Array // 모노
  gridOrigin: number // 버퍼 안에서 구간 첫 마디 1박의 시각 (초)
  clickTimes: number[] // 클릭 시각 (초, gridOrigin = 0 기준) — 카운트인 포함
  duration: number // 초
}

/** 카운트인 + 마디 수만큼 메트로놈. lead 초 쉬고 시작. */
export function renderMetronome(
  sr: number,
  o: { bpm: number; bars: number; beatsPerBar: number; countInBeats: number; lead?: number; tail?: number; volume?: number },
): MetronomeRender {
  const spb = 60 / o.bpm
  const lead = o.lead ?? 0.4
  const tail = o.tail ?? 1.5
  const gridOrigin = lead + o.countInBeats * spb
  const duration = gridOrigin + o.bars * o.beatsPerBar * spb + tail
  const samples = new Float32Array(Math.ceil(duration * sr))
  const vol = o.volume ?? 0.6
  const kinds: Record<ClickKind, Float32Array> = {
    accent: clickSamples(sr, 'accent'),
    beat: clickSamples(sr, 'beat'),
    count: clickSamples(sr, 'count'),
    cal: clickSamples(sr, 'cal'),
  }
  const clickTimes: number[] = []
  for (let k = 0; k < o.countInBeats; k++) {
    const t = lead + k * spb
    addAt(samples, kinds.count, t * sr, vol)
    clickTimes.push(t - gridOrigin)
  }
  for (let b = 0; b < o.bars * o.beatsPerBar; b++) {
    const t = gridOrigin + b * spb
    addAt(samples, b % o.beatsPerBar === 0 ? kinds.accent : kinds.beat, t * sr, b % o.beatsPerBar === 0 ? vol : vol * 0.75)
    clickTimes.push(t - gridOrigin)
  }
  return { samples, gridOrigin, clickTimes, duration }
}

/** 지연 측정용: lead 초 뒤부터 interval 간격으로 count 번 클릭 */
export function renderCalibration(sr: number, count = 8, interval = 0.6, lead = 0.5) {
  const times = Array.from({ length: count }, (_, k) => lead + k * interval)
  const duration = lead + count * interval + 0.6
  const samples = new Float32Array(Math.ceil(duration * sr))
  const c = clickSamples(sr, 'cal')
  for (const t of times) addAt(samples, c, t * sr, 0.9)
  return { samples, times, duration }
}

/** 반주(피아노 등) 위에 메트로놈을 얹는다. bgOffset: 반주 버퍼에서 구간 첫 마디 1박이 있는 시각(초) */
export function mixOnto(
  metro: MetronomeRender,
  sr: number,
  bg: Float32Array[], // 채널별
  bgOffset: number,
  bgGain = 0.9,
): Float32Array[] {
  const chans = bg.length ? bg.length : 1
  const out = Array.from({ length: chans }, () => new Float32Array(metro.samples.length))
  const shift = Math.round((metro.gridOrigin - bgOffset) * sr) // out[i] = bg[i - shift]
  for (let c = 0; c < chans; c++) {
    const o = out[c]
    o.set(metro.samples)
    const b = bg[c]
    if (!b) continue
    // 반주는 구간 첫 마디부터만 — 카운트인 동안엔 메트로놈만 (반주 음원 자체의 카운트인과 겹치지 않게)
    for (let i = Math.max(0, shift, Math.round(metro.gridOrigin * sr)); i < o.length; i++) {
      const k = i - shift
      if (k >= b.length) break
      o[i] += b[k] * bgGain
    }
  }
  return out
}

// ───────────────────────── 악보대로 치는 '원곡' 드럼 (비교 듣기용) ─────────────────────────

function drumVoice(sr: number, inst: string): Float32Array {
  let seed = 98765
  const noise = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return seed / 0x7fffffff - 1
  }
  const dur = inst === 'crash' ? 1.2 : inst === 'ride' ? 0.7 : inst === 'hihat-open' ? 0.3 : inst === 'kick' || inst.startsWith('tom') || inst === 'floor' ? 0.35 : 0.2
  const n = Math.round(sr * dur)
  const out = new Float32Array(n)
  // 고역 통과 잡음 (심벌류)
  const hpNoise = (cut: number) => {
    const a = Math.exp((-2 * Math.PI * cut) / sr)
    let pi = 0, po = 0
    return () => {
      const v = noise()
      po = a * (po + v - pi)
      pi = v
      return po
    }
  }
  if (inst === 'kick' || inst === 'tom1' || inst === 'tom2' || inst === 'floor') {
    const [f0, f1, dec, g] =
      inst === 'kick' ? [130, 48, 0.12, 1] : inst === 'tom1' ? [260, 190, 0.14, 0.7] : inst === 'tom2' ? [200, 150, 0.16, 0.7] : [150, 105, 0.2, 0.75]
    let ph = 0
    for (let i = 0; i < n; i++) {
      const t = i / sr
      const f = f1 + (f0 - f1) * Math.exp(-t / 0.03)
      ph += (2 * Math.PI * f) / sr
      out[i] = g * (Math.sin(ph) * Math.exp(-t / dec) + (i < sr * 0.002 ? noise() * 0.4 : 0))
    }
  } else if (inst === 'snare' || inst === 'rim') {
    const hp = hpNoise(1200)
    for (let i = 0; i < n; i++) {
      const t = i / sr
      out[i] = 0.6 * hp() * Math.exp(-t / 0.05) + 0.4 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.04)
    }
  } else if (inst === 'ride') {
    const hp = hpNoise(5000)
    const fs = [3100, 4720, 5930, 7400]
    for (let i = 0; i < n; i++) {
      const t = i / sr
      let m = 0
      for (const f of fs) m += Math.sin(2 * Math.PI * f * t)
      out[i] = (0.12 * m + 0.25 * hp()) * Math.exp(-t / 0.25) * 0.6
    }
  } else {
    // hihat, hihat-open, crash, 그 밖
    const hp = hpNoise(inst === 'crash' ? 3000 : 7000)
    const dec = inst === 'crash' ? 0.45 : inst === 'hihat-open' ? 0.12 : 0.025
    const g = inst === 'crash' ? 0.6 : 0.45
    for (let i = 0; i < n; i++) out[i] = g * hp() * Math.exp(-i / sr / dec)
  }
  return out
}

/** 악보(연습 지도)의 타격을 그대로 친 드럼 소리. gridOrigin 초에 구간 첫 마디 1박. */
export function renderDrums(
  sr: number,
  hits: { t: number; insts: string[] }[], // t: 구간 시작 = 0 (초)
  duration: number,
  gridOrigin: number,
): Float32Array {
  const out = new Float32Array(Math.ceil(duration * sr))
  const cache = new Map<string, Float32Array>()
  for (const h of hits) {
    for (const inst of h.insts) {
      let v = cache.get(inst)
      if (!v) cache.set(inst, (v = drumVoice(sr, inst)))
      addAt(out, v, (gridOrigin + h.t) * sr, 0.55)
    }
  }
  return out
}

// 박자 체크 — 녹음에서 친 시점을 찾고 악보의 정답 시점과 비교한다.
// 브라우저/Node 어디서나 돌도록 DOM 없이 순수 계산만 둔다.

// ───────────────────────── 정답 (악보에서 뽑은 칠 시점) ─────────────────────────

export interface ExpectedHit {
  idx: number // 악보 타격 묶음(onset) 인덱스
  m: number
  beat: number
  t: number // 초 — 연습 구간 첫 마디 1박 = 0
  insts: string[]
  roll: boolean
}

// ───────────────────────── FFT (실수 입력, radix-2) ─────────────────────────

function makeFFT(n: number) {
  const levels = Math.log2(n)
  if (!Number.isInteger(levels)) throw new Error('FFT 크기는 2의 거듭제곱')
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n)
    sin[i] = Math.sin((2 * Math.PI * i) / n)
  }
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < levels; b++) r |= ((i >>> b) & 1) << (levels - 1 - b)
    rev[i] = r
  }
  // re/im 를 제자리에서 변환
  return (re: Float64Array, im: Float64Array) => {
    for (let i = 0; i < n; i++) {
      const j = rev[i]
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t
        t = im[i]; im[i] = im[j]; im[j] = t
      }
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2
      const step = n / size
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half
          const tre = re[l] * cos[k] + im[l] * sin[k]
          const tim = -re[l] * sin[k] + im[l] * cos[k]
          re[l] = re[j] - tre
          im[l] = im[j] - tim
          re[j] += tre
          im[j] += tim
        }
      }
    }
  }
}

// ───────────────────────── 타격 찾기 ─────────────────────────

export interface Onset {
  time: number // 초 (녹음 첫 샘플 = 0)
  strength: number // 타격 세기 (엔벨로프 상승폭)
  flux: number // 스펙트럼 변화량 (정규화) — 진짜 타격일수록 크다
}

export interface DetectOptions {
  /** 이 시각(초) 이전/이후는 무시 */
  from?: number
  to?: number
  /** 진행률 콜백 (0~1). 넘기면 중간중간 쉬어가며 UI 가 멈추지 않게 한다 */
  onProgress?: (p: number) => void
  /**
   * 같은 순간 스피커(이어폰)로 나간 소리 — 앱이 튼 반주·클릭을 x 와 같은 샘플 위치(같은 시각)로 받아 둔 것.
   * 주면 마이크로 새어 들어온 반주를 스펙트럼에서 빼고 찾는다. (폰 스피커로 틀고 치면 기타 스트로크·클릭이
   * 마이크에 들어와 '친 소리'로 잡히는데, 무엇을 틀었는지는 우리가 정확히 아니까 그만큼 빼면 된다)
   */
  reference?: Float32Array
  /** 스피커 → 마이크 지연(초, 지연 측정값). 모르면 비워 두면 소리끼리 맞춰 보고 찾는다 */
  referenceLag?: number | null
  /**
   * 이 시각(초, x 기준)까지는 내가 아직 안 치는 구간(카운트인) — 반주가 새는지는 여기서만 판단한다.
   * 박에 맞춰 잘 치면 내 소리도 반주와 '닮아' 보여서, 칠 때 섞어서 보면 이어폰인데도 샌다고 착각한다.
   * 판단할 구간이 1초도 안 되면 빼지 않는다. 비우면 전체로 판단 (지연 측정 등)
   */
  quietTo?: number
  /** 'on'/'off' = 판단 없이 빼기 / 안 빼기 (실시간 표시: 카운트인 때 한 번 판단해 두고 그대로 쓴다) */
  bleedMode?: 'auto' | 'on' | 'off'
  /** 반주가 얼마나 새어 들어왔는지 알려 준다 */
  onBleed?: (b: BleedInfo) => void
}

export interface BleedInfo {
  lag: number // 반주가 마이크에 들어온 지연 (초)
  level: number // 마이크 소리가 반주와 얼마나 닮았나 (0 ~ 1, 0.3 넘으면 스피커 소리가 꽤 들어온 것)
  removed: number // 반주 소리라서 버린 후보 수
  on: boolean // 실제로 뺐는지
  decided: boolean // 판단할 만큼(카운트인 1초 이상) 들었는지 — false 면 다음에 다시 판단
}

// 소리 크기 변화(시작 순간들)끼리 맞춰 보며 reference 가 x 에 몇 초 늦게 들어왔는지 찾는다
function referenceLag(x: Float32Array, r: Float32Array, from: number, to: number, sr: number, hop: number, guess: number | null) {
  const n = Math.floor((to - from) / hop)
  const env = (sig: Float32Array) => {
    const d = new Float64Array(n)
    let prev = 0
    for (let i = 0; i < n; i++) {
      let e = 0
      const s = from + i * hop
      for (let k = 0; k < hop && s + k < sig.length; k++) e += sig[s + k] * sig[s + k]
      const l = Math.log(1e-10 + e)
      d[i] = i > 0 ? Math.max(0, l - prev) : 0
      prev = l
    }
    let m = 0
    for (const v of d) m += v
    m /= n || 1
    let v2 = 0
    for (let i = 0; i < n; i++) { d[i] -= m; v2 += d[i] * d[i] }
    const sd = Math.sqrt(v2 / (n || 1)) || 1
    for (let i = 0; i < n; i++) d[i] /= sd
    return d
  }
  const ex = env(x)
  const er = env(r)
  const lo = guess === null ? 0 : Math.max(0, Math.round((guess - 0.02) * sr / hop))
  const hi = guess === null ? Math.round(0.5 * sr / hop) : Math.round((guess + 0.02) * sr / hop)
  let best = guess === null ? 0 : Math.round(guess * sr / hop)
  let bestC = -Infinity
  for (let L = lo; L <= hi; L++) {
    let c = 0
    for (let i = 0; i + L < n; i++) c += ex[i + L] * er[i]
    c /= Math.max(1, n - L)
    if (c > bestC) { bestC = c; best = L }
  }
  // 지연 측정값 근처(±20ms)에서 찾았어도 찾은 자리를 쓴다 (출력 장치가 바뀌어 조금 달라졌을 수 있다)
  return { lag: (best * hop) / sr, corr: Math.max(0, bestC) }
}

const yieldToUI = () => new Promise<void>(r => setTimeout(r, 0))

// 2차 IIR (RBJ biquad) — 대역별로 시작 순간을 다듬을 때 쓴다
function biquad(x: Float32Array, lo: number, hi: number, sr: number, type: 'lp' | 'hp', fc: number): Float64Array {
  const w0 = (2 * Math.PI * fc) / sr
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2)
  const cw = Math.cos(w0)
  const b0 = type === 'lp' ? (1 - cw) / 2 : (1 + cw) / 2
  const b1 = type === 'lp' ? 1 - cw : -(1 + cw)
  const b2 = b0
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha
  const y = new Float64Array(hi - lo)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = lo; i < hi; i++) {
    const v = x[i]
    const out = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0
    x2 = x1; x1 = v; y2 = y1; y1 = out
    y[i - lo] = out
  }
  return y
}

/**
 * 타격 찾기.
 * 1) 저음(킥)·중음(스네어·탐)·고음(심벌) 세 대역에서 따로 SuperFlux(Böck 2013)를 구해
 *    대역마다 정규화한 뒤 가장 큰 값을 쓴다 — 크래시가 크게 울리는 중에 들어온 킥처럼
 *    한 대역에서만 두드러지는 타격도 놓치지 않으려는 것.
 * 2) 후보마다 그 대역으로 걸러낸 파형의 엔벨로프로 시작 순간을 샘플 단위로 다듬는다.
 * 드럼 소리와 메트로놈 클릭이 같은 방식으로 잡혀서, 지연 측정(클릭)과 연주 분석(드럼)의 기준이 같다.
 */
export async function detectOnsets(x: Float32Array, sr: number, opts: DetectOptions = {}): Promise<Onset[]> {
  const N = sr > 64000 ? 2048 : 1024
  const hop = Math.max(64, Math.round(sr * 0.004)) // 4ms
  const from = Math.max(0, Math.floor((opts.from ?? 0) * sr))
  const to = Math.min(x.length, Math.ceil((opts.to ?? x.length / sr) * sr))
  if (to - from < N * 2) return []

  const fft = makeFFT(N)
  const win = new Float64Array(N)
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N)
  const re = new Float64Array(N)
  const im = new Float64Array(N)
  const half = N / 2
  const bin = (hz: number) => Math.min(half - 1, Math.max(1, Math.round((hz * N) / sr)))
  const BANDS = [
    [bin(30), bin(180)],
    [bin(180), bin(2000)],
    [bin(2000), bin(16000)],
  ]
  // SuperFlux: 2프레임 전 스펙트럼을 주파수 방향 최대값 필터한 것과 비교 — 심벌 잔향의 출렁임은 걸러진다
  const LAG = 2
  const hist = [new Float64Array(half), new Float64Array(half), new Float64Array(half)]
  const frames = Math.floor((to - from - N) / hop) + 1

  // ── 스피커로 새어 들어온 반주 빼기 준비 ──
  const R = opts.reference
  let bleed: { lagS: number; gain: Float64Array; level: number } | null = null
  const spec = (sig: Float32Array, s: number, out: Float64Array) => {
    if (s < 0 || s + N > sig.length) {
      out.fill(0)
      return
    }
    for (let i = 0; i < N; i++) {
      re[i] = sig[s + i] * win[i]
      im[i] = 0
    }
    fft(re, im)
    for (let b = 1; b < half; b++) out[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b])
  }
  // 주파수를 로그 간격 묶음으로 (묶음마다 '반주 1 이 마이크에 얼마로 들어오나'를 따로 잰다)
  const GROUPS = 24
  const groupOf = new Uint8Array(half)
  for (let b = 0; b < half; b++) {
    const hz = Math.max(30, (b * sr) / N)
    groupOf[b] = Math.min(GROUPS - 1, Math.floor((Math.log(hz / 30) / Math.log(16000 / 30)) * GROUPS))
  }
  const mode = opts.bleedMode ?? 'auto'
  if (R && mode !== 'off') {
    // 새는지 판단은 '안 치는 구간'에서만 — 박에 딱 맞게 치는 사람의 소리가 반주와 닮아 보이지 않게
    const quietEnd = opts.quietTo != null ? Math.min(to, Math.max(from, Math.round(opts.quietTo * sr))) : to
    const enoughQuiet = quietEnd - from >= sr
    const lg = referenceLag(x, R, from, mode === 'on' ? to : quietEnd, sr, hop, opts.referenceLag ?? null)
    const decided = mode === 'on' || enoughQuiet
    // 0.25: 짧은 카운트인에서 지연을 넓게 찾으면 우연히 0.15 정도는 닮아 보인다. 실제로 새면 0.6 이상
    const on = mode === 'on' || (enoughQuiet && lg.corr >= 0.25)
    const lagS = Math.round(lg.lag * sr)
    if (!on) opts.onBleed?.({ lag: lg.lag, level: lg.corr, removed: 0, on: false, decided })
    else {
      // 묶음별 (마이크 / 반주) 비율 — 반주가 뚜렷한 프레임들에서 아래쪽 분위값: 내가 친 소리가 섞인 프레임은 비율이 커서 영향이 적다
      const ratios: number[][] = Array.from({ length: GROUPS }, () => [])
      const rLevels: number[][] = Array.from({ length: GROUPS }, () => [])
      const mx = new Float64Array(half)
      const mr = new Float64Array(half)
      const step = Math.max(1, Math.floor(frames / 1500)) // 1500 프레임 정도면 충분
      for (let f = 0; f < frames; f += step) {
        const s = from + f * hop
        spec(R, s - lagS, mr)
        spec(x, s, mx)
        const gx = new Float64Array(GROUPS)
        const gr = new Float64Array(GROUPS)
        for (let b = 1; b < half; b++) {
          gx[groupOf[b]] += mx[b]
          gr[groupOf[b]] += mr[b]
        }
        for (let g = 0; g < GROUPS; g++) {
          if (gr[g] <= 1e-6) continue
          rLevels[g].push(gr[g])
          ratios[g].push(gx[g] / gr[g])
        }
      }
      const gain = new Float64Array(GROUPS)
      for (let g = 0; g < GROUPS; g++) {
        const lv = [...rLevels[g]].sort((a, b) => a - b)
        if (lv.length < 20) continue
        const thr = lv[Math.floor(lv.length * 0.5)] // 반주가 중간 이상 클 때만
        const rs = ratios[g].filter((_, i) => rLevels[g][i] >= thr).sort((a, b) => a - b)
        // 아래쪽 10% 값 ×1.25: 반주만 들어온 프레임에선 비율이 거의 일정하고(±30%), 내가 친 프레임은 비율이 위로 튄다
        gain[g] = rs.length ? rs[Math.floor(rs.length * 0.1)] * 1.25 : 0
      }
      bleed = { lagS, gain, level: lg.corr }
    }
    if (opts.onProgress) await yieldToUI()
  }
  const SPREAD = 2
  const ALPHA = 3 // 넉넉히 뺀다 (방 울림·스피커 찌그러짐 몫)
  const TAIL = Math.exp(-hop / sr / 0.25) // 방 울림으로 반주 소리가 0.25초 정도 끌린다고 보고
  const rRing = [new Float64Array(half), new Float64Array(half), new Float64Array(half)]
  const rTail = new Float64Array(half)
  const magRing = [new Float64Array(half), new Float64Array(half), new Float64Array(half)]
  const curS = new Float64Array(half)
  const refS = new Float64Array(half)
  const mask = new Float64Array(half)
  if (bleed && R) {
    spec(R, from - bleed.lagS, rRing[0])
    if (frames > 1) spec(R, from + hop - bleed.lagS, rRing[1])
  }

  const bandFlux = BANDS.map(() => new Float64Array(frames))
  const bandFluxS = bleed ? BANDS.map(() => new Float64Array(frames)) : bandFlux
  const rms = new Float64Array(frames)
  for (let f = 0; f < frames; f++) {
    const s = from + f * hop
    let e = 0
    for (let i = 0; i < N; i++) {
      const v = x[s + i]
      e += v * v
      re[i] = v * win[i]
      im[i] = 0
    }
    rms[f] = Math.sqrt(e / N)
    fft(re, im)
    const cur = hist[f % 3]
    const ref = hist[(f + 3 - LAG) % 3]
    const mag = magRing[f % 3]
    for (let b = 1; b < half; b++) {
      mag[b] = Math.sqrt(re[b] * re[b] + im[b] * im[b])
      cur[b] = Math.log1p(1000 * mag[b])
    }
    if (bleed && R) {
      // 지금 반주 크기(앞뒤 한 프레임까지 — 살짝 어긋나도 빠지게) + 울림 꼬리 = 이번 프레임에서 뺄 몫
      spec(R, s + hop - bleed.lagS, rRing[(f + 1) % 3])
      const a = rRing[(f + 2) % 3], c = rRing[f % 3], d = rRing[(f + 1) % 3]
      for (let b = 1; b < half; b++) rTail[b] = Math.max(a[b], c[b], d[b], rTail[b] * TAIL)
      // 주파수로도 ±2칸 최대값 — 방 울림·스피커 색깔로 반주 소리가 옆 칸으로 번진 몫까지
      for (let b = 1; b < half; b++) {
        let m = rTail[b]
        for (let k = Math.max(1, b - SPREAD); k <= Math.min(half - 1, b + SPREAD); k++) if (rTail[k] > m) m = rTail[k]
        mask[b] = ALPHA * bleed.gain[groupOf[b]] * m
      }
    }
    if (f >= LAG) {
      const flux = (c: Float64Array, r: Float64Array, out: Float64Array[]) =>
        BANDS.forEach(([b0, b1], k) => {
          let sum = 0
          for (let b = b0; b < b1; b++) {
            const d = c[b] - Math.max(r[b - 1], r[b], r[b + 1] ?? 0)
            if (d > 0) sum += d
          }
          out[k][f] = sum
        })
      flux(cur, ref, bandFlux)
      if (bleed) {
        // 지금 프레임과 2프레임 전을 '같은(지금의) 몫'을 빼고 비교한다.
        // 프레임마다 다른 몫을 빼면 반주가 작아지는 순간 가려졌던 소리가 '새로 생긴 것'처럼 보인다.
        const prev = magRing[(f + 3 - LAG) % 3]
        for (let b = 1; b < half; b++) {
          curS[b] = Math.log1p(1000 * Math.max(0, mag[b] - mask[b]))
          refS[b] = Math.log1p(1000 * Math.max(0, prev[b] - mask[b]))
        }
        flux(curS, refS, bandFluxS)
      }
    }
    if (opts.onProgress && f % 3000 === 0) {
      opts.onProgress((0.85 * f) / frames)
      await yieldToUI()
    }
  }

  // 대역마다 상위 1% 값을 1 로 맞춘 뒤 가장 큰 대역 값을 쓴다.
  // 반주를 뺀 경우에도 '빼기 전' 크기로 맞춘다 — 아무것도 안 쳤을 때 남은 찌꺼기가 1 로 부풀려지지 않게.
  const odf = new Float64Array(frames)
  const which = new Uint8Array(frames)
  const kept = new Float64Array(frames) // 빼고 남은 비율 (반주 소리면 거의 0)
  bandFlux.forEach((bf, k) => {
    const sorted = Float64Array.from(bf).sort()
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1
    const bs = bandFluxS[k]
    for (let f = 0; f < frames; f++) {
      const v = bs[f] / p99
      if (v > odf[f]) { odf[f] = v; which[f] = k; kept[f] = bf[f] > 0 ? bs[f] / bf[f] : 0 }
    }
  })
  const rmsSorted = Float64Array.from(rms).sort()
  const noise = rmsSorted[Math.floor(rmsSorted.length * 0.1)] || 0

  // 봉우리 고르기 (Böck 2012: 주변 최대 + 주변 평균보다 delta 이상)
  const fps = sr / hop
  const preMax = Math.round(0.03 * fps)
  const postMax = Math.round(0.03 * fps)
  const preAvg = Math.round(0.1 * fps)
  const postAvg = Math.round(0.07 * fps)
  const delta = 0.1
  const peaks: number[] = []
  for (let f = 1; f < frames - 1; f++) {
    const v = odf[f]
    if (v < 0.08) continue
    let isMax = true
    for (let k = Math.max(0, f - preMax); k <= Math.min(frames - 1, f + postMax); k++) {
      if (odf[k] > v || (odf[k] === v && k < f)) { isMax = false; break }
    }
    if (!isMax) continue
    let sum = 0, cnt = 0
    for (let k = Math.max(0, f - preAvg); k <= Math.min(frames - 1, f + postAvg); k++) { sum += odf[k]; cnt++ }
    if (v < sum / cnt + delta) continue
    peaks.push(f)
  }

  // 시작 순간 다듬기: 피크홀드 엔벨로프가 바닥에서 20% 오른 순간.
  // 먼저 원래 파형으로 해 보고, 다른 소리(크래시 잔향 등)에 묻혀 뚜렷이 안 오르면
  // 그 타격이 잡힌 대역만 걸러낸 파형으로 다시 한다. (대역 필터는 몇 ms 늦게 잡히는 경향이 있어 꼭 필요할 때만)
  const ms = (t: number) => Math.round((t * sr) / 1000)
  const decay = Math.pow(0.5, 1 / ms(2)) // 반감기 2ms
  const refine = (sig: ArrayLike<number>, len: number, rs: number) => {
    const env = new Float64Array(len)
    let e = 0
    for (let i = 0; i < len; i++) {
      const a = Math.abs(sig[i])
      e = a > e ? a : e * decay
      env[i] = e
    }
    let p = rs
    for (let i = rs; i < len; i++) if (env[i] > env[p]) p = i
    const M = env[p]
    const b0 = Math.max(0, p - ms(45))
    const b1 = Math.max(0, p - ms(15))
    let B = M
    if (b1 > b0) {
      const seg = Array.from(env.subarray(b0, b1)).sort((a, b) => a - b)
      B = seg[Math.floor(seg.length / 2)]
    } else if (p > 0) B = env[0]
    const thr = B + 0.2 * (M - B)
    let n = p
    const stop = Math.max(0, p - ms(30))
    while (n > stop && env[n - 1] >= thr) n--
    return { n, M, B }
  }
  const raw: Onset[] = []
  let removed = 0
  for (const f of peaks) {
    // 반주를 빼니 대부분 사라지는 소리 = 스피커에서 새어 들어온 반주
    if (bleed && kept[f] < 0.4) {
      removed++
      continue
    }
    const s0 = from + f * hop
    const lo = Math.max(from, s0 - ms(60) - half)
    const hi = Math.min(to, s0 + N + N / 4)
    const len = hi - lo
    if (len <= 0) continue
    const rs = Math.max(0, s0 - half - lo)
    let r = refine(x.subarray(lo, hi), len, rs)
    const band = which[f]
    if (r.M < r.B * 1.6 && band !== 1) {
      const sig = band === 0 ? biquad(x, lo, hi, sr, 'lp', 200) : biquad(x, lo, hi, sr, 'hp', 2000)
      const rb = refine(sig, len, rs)
      if (rb.M > rb.B * 1.6) r = rb
    }
    if (r.M - r.B < Math.max(0.0015, noise * 2)) continue
    raw.push({ time: (lo + r.n) / sr, strength: r.M - r.B, flux: odf[f] })
  }
  raw.sort((a, b) => a.time - b.time)

  // 너무 붙은 후보(30ms 안) 합치기 — 플램 앞꾸밈음처럼 약한 앞 소리는 버린다
  const out: Onset[] = []
  for (const o of raw) {
    const last = out[out.length - 1]
    if (last && o.time - last.time < 0.03) {
      if (o.flux > last.flux * 2) out[out.length - 1] = o
      else last.flux = Math.max(o.flux, last.flux)
      continue
    }
    out.push(o)
  }
  if (bleed) opts.onBleed?.({ lag: bleed.lagS / sr, level: bleed.level, removed, on: true, decided: true })
  opts.onProgress?.(1)
  return out
}

// ───────────────────────── 지연(왕복) 측정 ─────────────────────────

export interface LatencyResult {
  ok: boolean
  latency: number // 초
  spread: number // 측정값들의 흔들림 (초, 중앙값 절대편차)
  matched: number
}

/**
 * 알려진 시각에 낸 클릭(clickTimes)과 녹음에서 찾은 타격(onsetTimes)으로 왕복 지연을 구한다. 둘 다 같은 시계(초).
 * 클릭마다 다음 클릭 전까지 창 안에서, 가장 센 소리의 절반 이상인 첫 소리를 고른다 (잔향·잡음보다 직접음이 먼저·세다).
 */
export function estimateLatency(clickTimes: number[], onsetTimes: number[], strengths?: number[], maxLatency = 0.5): LatencyResult {
  const lags: number[] = []
  for (let k = 0; k < clickTimes.length; k++) {
    const c = clickTimes[k]
    const next = k + 1 < clickTimes.length ? clickTimes[k + 1] : Infinity
    const idx: number[] = []
    onsetTimes.forEach((t, j) => {
      if (t >= c - 0.005 && t < Math.min(c + maxLatency, next - 0.005)) idx.push(j)
    })
    if (!idx.length) continue
    const st = (j: number) => (strengths ? strengths[j] : 1)
    const strongest = Math.max(...idx.map(st))
    const pick = idx.find(j => st(j) >= strongest * 0.5) ?? idx[0]
    lags.push(onsetTimes[pick] - c)
  }
  if (lags.length === 0) return { ok: false, latency: 0, spread: 1, matched: 0 }
  const sorted = [...lags].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  const dev = lags.map(l => Math.abs(l - med)).sort((a, b) => a - b)
  const spread = dev[Math.floor(dev.length / 2)]
  const good = lags.filter(l => Math.abs(l - med) < 0.006)
  const latency = good.reduce((s, l) => s + l, 0) / good.length
  return {
    ok: good.length >= Math.ceil(clickTimes.length * 0.6) && spread < 0.004,
    latency,
    spread,
    matched: good.length,
  }
}

/**
 * 지연 보정이 없거나 틀렸을 때: 친 소리들이 정답 시각들과 가장 많이 겹치는 '전체 밀림'을 찾는다 (-150 ~ +400ms).
 * 이 값을 빼고 맞춰보면 짝짓기는 되지만, 원래 박보다 빨랐는지/늦었는지 절대값은 알 수 없다.
 */
export function estimateGlobalLag(expected: number[], played: number[], lo = -0.15, hi = 0.4): number {
  const exp = [...expected].sort((a, b) => a - b)
  if (!exp.length || !played.length) return 0
  const near = (t: number) => {
    let a = 0, b = exp.length
    while (a < b) { const m = (a + b) >> 1; if (exp[m] < t) a = m + 1; else b = m }
    let best = Infinity
    for (const k of [a - 1, a]) if (k >= 0 && k < exp.length) best = Math.min(best, Math.abs(exp[k] - t))
    return best
  }
  let bestLag = 0, bestScore = -1
  for (let lag = lo; lag <= hi + 1e-9; lag += 0.002) {
    let score = 0
    for (const p of played) if (near(p - lag) < 0.015) score++
    if (score > bestScore) { bestScore = score; bestLag = lag }
  }
  // 다듬기: 그 밀림으로 가까운(±25ms) 짝들의 차이 중앙값
  const diffs: number[] = []
  for (const p of played) {
    const t = p - bestLag
    let a = 0, b = exp.length
    while (a < b) { const m = (a + b) >> 1; if (exp[m] < t) a = m + 1; else b = m }
    let d = Infinity
    for (const k of [a - 1, a]) if (k >= 0 && k < exp.length && Math.abs(t - exp[k]) < Math.abs(d)) d = t - exp[k]
    if (Math.abs(d) < 0.025) diffs.push(d)
  }
  diffs.sort((x, y) => x - y)
  return bestLag + (diffs.length ? diffs[diffs.length >> 1] : 0)
}

// ───────────────────────── 정답과 맞춰보기 ─────────────────────────

export interface HitResult {
  idx: number // 악보 타격 묶음(onset) 인덱스
  m: number
  beat: number
  t: number // 정답 시각 (초, 구간 시작 = 0)
  insts: string[]
  roll: boolean
  played: number | null // 내가 친 시각 (초) — 못 쳤으면 null
  dev: number | null // 오차 (ms, + 늦게 / - 빨리)
}

export interface MatchResult {
  hits: HitResult[]
  extras: number[] // 악보에 없는데 친 시각 (초)
}

/**
 * 정답 타격마다 실제 타격을 하나씩 짝지어 준다.
 * 허용 범위는 이웃 정답과의 간격 절반(최대 120ms) — 그보다 멀면 놓친 것으로 본다.
 * 범위 안에 후보가 여럿이면 "가깝고 + 세게 때린" 것을 고른다. 심벌 잔향 같은 약한 소리가
 * 진짜 타격보다 조금 더 가깝다는 이유로 뽑히지 않게 하려는 것.
 */
export interface MatchOptions {
  weights?: number[] // played 와 같은 순서의 스펙트럼 변화량 (detectOnsets 의 flux) — 짝 고를 때
  strengths?: number[] // played 와 같은 순서의 소리 크기 상승폭 (detectOnsets 의 strength) — 추가 타격 거를 때
  clickTimes?: number[] // 메트로놈 클릭 시각 — 클릭에 딱 맞는 작은 소리는 추가 타격으로 안 센다
  bleed?: { clickTimes: number[]; level: number } // 스피커 클릭이 새어 들어온 크기 (estimateBleed) — 그 정도 소리는 미리 뺀다
  maxWindow?: number // 초
  spanEnd?: number // 분석 구간 끝 (초) — 이 뒤의 소리는 추가 타격으로 안 센다
}

export function matchHits(expected: ExpectedHit[], played: number[], opts: MatchOptions = {}): MatchResult {
  const b = opts.bleed
  if (!b || !opts.strengths) return matchOnce(expected, played, opts)
  // 스피커 메트로놈이 마이크로 새어 들어온 소리: 클릭 시각에 딱 맞고, 카운트인 때 잰 새는 소리 크기 정도로 작은 것 → 짝짓기 전에 뺀다.
  // (안 빼면 드럼을 안 친 박이 클릭 소리 덕에 '정확'으로 잡힌다)
  const st = opts.strengths
  const keep = played.map((p, j) => !(nearAny(b.clickTimes, p, 0.012) && st[j] <= b.level * 1.6))
  return matchOnce(
    expected,
    played.filter((_, j) => keep[j]),
    { ...opts, weights: opts.weights?.filter((_, j) => keep[j]), strengths: st.filter((_, j) => keep[j]) },
  )
}

/**
 * 카운트인(드럼을 아직 안 칠 때) 클릭 시각에 소리가 잡혔으면 스피커 소리가 새어 들어오는 것 — 그 크기를 돌려준다.
 * countInClicks: 카운트인 클릭 시각 (played 와 같은 기준), 대부분에서 잡혀야 '샌다'고 본다.
 */
export function estimateBleed(played: number[], strengths: number[], countInClicks: number[]): number | null {
  const hits: number[] = []
  for (const c of countInClicks) {
    const j = played.findIndex(p => Math.abs(p - c) < 0.015)
    if (j >= 0) hits.push(strengths[j])
  }
  if (countInClicks.length === 0 || hits.length < Math.max(2, Math.ceil(countInClicks.length * 0.75))) return null
  return hits.sort((a, b) => a - b)[Math.floor(hits.length / 2)]
}

function nearAny(sorted: number[], p: number, tol: number) {
  let lo = 0, hi = sorted.length
  while (lo < hi) { const c = (lo + hi) >> 1; if (sorted[c] < p) lo = c + 1; else hi = c }
  return [lo - 1, lo].some(k => k >= 0 && k < sorted.length && Math.abs(sorted[k] - p) < tol)
}

function matchOnce(expected: ExpectedHit[], played: number[], opts: MatchOptions = {}): MatchResult {
  const exp = [...expected].sort((a, b) => a.t - b.t)
  const w = opts.weights ?? played.map(() => 1)
  const maxWindow = opts.maxWindow ?? 0.12
  const clicks = opts.clickTimes ?? []
  if (!exp.length) return { hits: [], extras: [] }
  const SIGMA = 0.05
  const cands: { i: number; j: number; score: number }[] = []
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i]
    const left = i > 0 ? Math.min(maxWindow, (e.t - exp[i - 1].t) / 2) : maxWindow
    const right = i + 1 < exp.length ? Math.min(maxWindow, (exp[i + 1].t - e.t) / 2) : maxWindow
    const js: number[] = []
    for (let j = 0; j < played.length; j++) {
      const d = played[j] - e.t
      if (d >= -left && d <= right) js.push(j)
    }
    if (!js.length) continue
    const wmax = Math.max(...js.map(j => w[j])) || 1
    for (const j of js) {
      const d = played[j] - e.t
      cands.push({ i, j, score: (w[j] / wmax) * Math.exp(-0.5 * (d / SIGMA) ** 2) })
    }
  }
  cands.sort((a, b) => b.score - a.score)
  const usedE = new Map<number, number>()
  const usedP = new Set<number>()
  for (const c of cands) {
    if (usedE.has(c.i) || usedP.has(c.j)) continue
    usedE.set(c.i, c.j)
    usedP.add(c.j)
  }
  const hits: HitResult[] = exp.map((e, i) => {
    const j = usedE.get(i)
    const p = j === undefined ? null : played[j]
    return {
      idx: e.idx, m: e.m, beat: e.beat, t: e.t, insts: e.insts, roll: e.roll,
      played: p,
      dev: p === null ? null : Math.round((p - e.t) * 10000) / 10,
    }
  })
  // 롤 구간(롤 시작 ~ 다음 정답) 안의 소리는 롤이라서 셈에서 뺀다
  const rollSpans: [number, number][] = []
  exp.forEach((e, i) => {
    if (e.roll) rollSpans.push([e.t - 0.05, i + 1 < exp.length ? exp[i + 1].t - 0.05 : e.t + 3])
  })
  // 짝 못 찾은 소리 중 '확실히 때린 것'만 추가 타격으로 센다
  const st = opts.strengths ?? w
  const mid = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
  const typical = mid([...usedP].map(j => w[j]))
  const typicalS = mid([...usedP].map(j => st[j]))
  const nearClick = (p: number) => nearAny(clicks, p, 0.012)
  // 분석한 구간 밖(앞뒤로 친 소리)은 추가 타격으로 세지 않는다
  const spanLo = exp[0].t - maxWindow
  const spanHi = opts.spanEnd ?? exp[exp.length - 1].t + maxWindow
  const extras = played.filter(
    (p, j) =>
      !usedP.has(j) &&
      p >= spanLo &&
      p <= spanHi &&
      w[j] >= typical * 0.3 &&
      st[j] >= typicalS * 0.15 &&
      !rollSpans.some(([a, b]) => p >= a && p <= b) &&
      // 클릭 시각에 딱 맞는 작은 소리는 스피커 메트로놈이 새어 들어온 것
      !(nearClick(p) && st[j] < typicalS * 0.5),
  )
  return { hits, extras }
}

// ───────────────────────── 요약 ─────────────────────────

export const GOOD_MS = 20 // 이 안쪽이면 "정확"
export const BIG_MS = 45 // 이보다 크면 "많이"

export type Verdict = 'good' | 'early' | 'late' | 'missed'

export function verdict(dev: number | null, offset = 0): Verdict {
  if (dev === null) return 'missed'
  const d = dev - offset
  if (d < -GOOD_MS) return 'early'
  if (d > GOOD_MS) return 'late'
  return 'good'
}

export interface MeasureStat {
  m: number
  count: number // 판정 대상 정답 수
  played: number
  missed: number
  extras: number
  meanDev: number | null // ms (+ 늦게)
  meanAbs: number | null
  good: number
}

export interface Summary {
  total: number
  played: number
  missed: number
  extras: number
  good: number
  accuracy: number // 0~100 (정확 / 전체)
  medianDev: number // ms
  meanAbs: number // ms
  spread: number // 표준편차 ms
  drift: number // 처음 → 끝 사이 경향 변화 (ms, + 점점 늦어짐)
  measures: MeasureStat[]
  byInst: { inst: string; count: number; meanDev: number }[]
  fillDev: number | null // 탐이 들어간 타격 평균
  grooveDev: number | null // 그 외 평균
  worst: number[] // 가장 흔들린 마디 (최대 3)
}

const median = (a: number[]) => {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const k = Math.floor(s.length / 2)
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2
}
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

/** offset: 판정 기준을 옮길 값(ms). "내 평균 기준" 보기에서 중앙값을 넣는다. */
export function summarize(res: MatchResult, fromBar: number, toBar: number, offset = 0, barLen?: number): Summary {
  const judged = res.hits.filter(h => !h.roll)
  const devs = judged.filter(h => h.dev !== null).map(h => (h.dev as number) - offset)
  const good = devs.filter(d => Math.abs(d) <= GOOD_MS).length
  const measures: MeasureStat[] = []
  for (let m = fromBar; m <= toBar; m++) {
    const hs = judged.filter(h => h.m === m)
    const ds = hs.filter(h => h.dev !== null).map(h => (h.dev as number) - offset)
    measures.push({
      m,
      count: hs.length,
      played: ds.length,
      missed: hs.length - ds.length,
      extras: 0,
      meanDev: ds.length ? Math.round(mean(ds) * 10) / 10 : null,
      meanAbs: ds.length ? Math.round(mean(ds.map(Math.abs)) * 10) / 10 : null,
      good: ds.filter(d => Math.abs(d) <= GOOD_MS).length,
    })
  }
  // 추가 타격을 친 시각의 마디에 배정 (마디 길이를 모르면 가장 가까운 정답의 마디)
  for (const p of res.extras) {
    let m: number | null = null
    if (barLen) m = fromBar + Math.floor(p / barLen)
    else if (res.hits.length) {
      let best = res.hits[0]
      for (const h of res.hits) if (Math.abs(h.t - p) < Math.abs(best.t - p)) best = h
      m = best.m
    }
    const ms = measures.find(x => x.m === m)
    if (ms) ms.extras++
  }
  // 시간에 따른 경향: 앞·가운데·뒤 1/3 중앙값이 한 방향으로 꾸준히 움직일 때만 '점점 빨라짐/늦어짐'으로 본다
  const timed = judged.filter(h => h.dev !== null).sort((a, b) => a.t - b.t)
  let drift = 0
  if (timed.length >= 30) {
    const k = Math.floor(timed.length / 3)
    const a = median(timed.slice(0, k).map(h => h.dev as number))
    const b = median(timed.slice(k, timed.length - k).map(h => h.dev as number))
    const c = median(timed.slice(-k).map(h => h.dev as number))
    const steady = (c - a > 0 && b - a > -5 && c - b > -5) || (c - a < 0 && b - a < 5 && c - b < 5)
    if (steady) drift = c - a
  }
  const insts = ['kick', 'snare', 'hihat', 'ride', 'crash', 'tom']
  const byInst = insts
    .map(inst => {
      const ds = judged
        .filter(h => h.dev !== null && h.insts.some(i => (inst === 'tom' ? /^(tom|floor)/.test(i) : i.startsWith(inst))))
        .map(h => (h.dev as number) - offset)
      return { inst, count: ds.length, meanDev: Math.round(mean(ds) * 10) / 10 }
    })
    .filter(x => x.count >= 3)
  const isFill = (h: HitResult) => h.insts.some(i => /^(tom|floor)/.test(i))
  const fd = judged.filter(h => h.dev !== null && isFill(h)).map(h => (h.dev as number) - offset)
  const gd = judged.filter(h => h.dev !== null && !isFill(h)).map(h => (h.dev as number) - offset)
  const badness = (x: MeasureStat) => (x.meanAbs ?? 0) + x.missed * 25
  const worst = measures
    .filter(x => x.count > 0 && (x.played >= 2 || x.missed > 0))
    .sort((a, b) => badness(b) - badness(a))
    .slice(0, 3)
    .filter(x => (x.meanAbs ?? 0) > GOOD_MS || x.missed > 0)
    .map(x => x.m)
  const sd = Math.sqrt(mean(devs.map(d => (d - mean(devs)) ** 2)))
  return {
    total: judged.length,
    played: devs.length,
    missed: judged.length - devs.length,
    extras: res.extras.length,
    good,
    accuracy: judged.length ? Math.round((good / judged.length) * 100) : 0,
    medianDev: Math.round(median(devs) * 10) / 10,
    meanAbs: Math.round(mean(devs.map(Math.abs)) * 10) / 10,
    spread: Math.round(sd * 10) / 10,
    drift: Math.round(drift * 10) / 10,
    measures,
    byInst,
    fillDev: fd.length >= 3 ? Math.round(mean(fd) * 10) / 10 : null,
    grooveDev: gd.length >= 3 ? Math.round(mean(gd) * 10) / 10 : null,
    worst,
  }
}

export const INST_KO: Record<string, string> = {
  kick: '킥',
  snare: '스네어',
  hihat: '하이햇',
  'hihat-open': '오픈 하이햇',
  'hihat-foot': '하이햇 페달',
  ride: '라이드',
  crash: '크래시',
  tom1: '하이탐',
  tom2: '미드탐',
  floor: '플로어탐',
  tom: '탐',
  rim: '림',
}

/** 받침에 맞춰 은/는 */
function withTopic(w: string) {
  const c = w.charCodeAt(w.length - 1) - 0xac00
  return w + (c >= 0 && c < 11172 && c % 28 ? '은' : '는')
}

/** 사람이 읽는 한 줄 평. relative = '내 평균 기준'으로 보는 중 (전체 경향은 말할 수 없음) */
export function insights(s: Summary, relative = false): string[] {
  const out: string[] = []
  const ms = (v: number) => `${Math.abs(Math.round(v))}ms`
  if (s.played === 0) return ['녹음에서 드럼 소리를 거의 찾지 못했어요. 마이크 권한·폰 위치를 확인해 주세요.']
  if (relative) out.push('내 평균 박자를 기준으로, 어디서 더 빨라지고 늦어지는지 보여줘요.')
  else if (Math.abs(s.medianDev) <= 8)
    out.push(s.accuracy >= 75 ? '전체적으로 박에 잘 붙어 있어요.' : '평균은 박에 맞는데, 구간마다 빨라졌다 늦어졌다 해요.')
  else if (s.medianDev < 0) out.push(`전체적으로 박보다 ${ms(s.medianDev)} 빠르게 쳤어요 (서두르는 편).`)
  else out.push(`전체적으로 박보다 ${ms(s.medianDev)} 늦게 쳤어요 (끄는 편).`)
  if (Math.abs(s.drift) >= 15)
    out.push(s.drift < 0 ? `뒤로 갈수록 점점 빨라졌어요 (처음보다 약 ${ms(s.drift)} 앞당겨짐).` : `뒤로 갈수록 점점 늦어졌어요 (처음보다 약 ${ms(s.drift)} 밀림).`)
  if (s.fillDev !== null && s.grooveDev !== null && Math.abs(s.fillDev - s.grooveDev) >= 12)
    out.push(
      s.fillDev < s.grooveDev
        ? `필인(탐)에서 평소보다 ${ms(s.fillDev - s.grooveDev)} 빨라져요.`
        : `필인(탐)에서 평소보다 ${ms(s.fillDev - s.grooveDev)} 늦어져요.`,
    )
  const insts = s.byInst.filter(b => b.inst !== 'tom')
  if (insts.length >= 2) {
    const lo = insts.reduce((a, b) => (b.meanDev < a.meanDev ? b : a))
    const hi = insts.reduce((a, b) => (b.meanDev > a.meanDev ? b : a))
    if (hi.meanDev - lo.meanDev >= 15)
      out.push(`${withTopic(INST_KO[lo.inst])} ${INST_KO[hi.inst]}보다 ${ms(hi.meanDev - lo.meanDev)} 앞서 나가요.`)
  }
  if (s.missed > 0) out.push(`악보에 있는데 소리가 안 잡힌 타격이 ${s.missed}개 있어요.`)
  if (s.worst.length) out.push(`가장 흔들린 마디: ${s.worst.map(m => `${m}마디`).join(', ')}`)
  return out
}

'use client'

// 녹음하면서 실시간으로: 최근 몇 초를 계속 훑어 새로 친 소리를 찾고, 악보 음표와 짝지어 바로 보여준다.
// (끝나고 하는 전체 분석이 더 정확해서, 끝나면 그 결과로 바꾼다)
//
// 같은 소리를 여러 번 훑으면 매번 시각이 조금씩 달라 이중으로 잡히므로, 시간 구간마다 딱 한 번만 '확정'한다.
// 창 맨 앞쪽은 앞 맥락이 없어 가짜 타격이 생기니 버리고, 맨 뒤쪽은 소리가 덜 들어왔으니 다음 차례로 미룬다.
//
// 구간 반복: 정답을 바퀴 수만큼 이어 붙여(바퀴마다 loopLen 초씩 뒤로) 한 줄로 짝짓는다 — 바퀴 경계도 한 번만 판정된다.
// 화면에는 지금 바퀴 표시만 주고, 다 돈 바퀴는 대략 정확도만 넘긴다.
import { estimateBleed, estimateGlobalLag, GOOD_MS, matchHits, type ExpectedHit } from './analysis'
import { detectOnsetsOffThread } from './onsetWorker'
import { loopClicks, LOOP_MAX_LAPS } from './check'
import type { PracticeAudio } from './engine'

export interface LiveState {
  marks: Map<number, number | null> // 지금 바퀴: onset idx → 오차 ms (null = 놓침)
  extras: number[] // 지금 바퀴의 악보에 없는 타격 — 바퀴 시작(구간 첫 마디 1박) = 0 기준 초
  lap: number // 지금 바퀴 (0부터). 반복이 아니면 늘 0
  laps: number[] // 다 돈 바퀴들의 대략 정확도 (%)
}

interface Heard {
  t: number // 구간 첫 마디 1박 = 0 (초)
  w: number // flux
  s: number // strength
}

const WINDOW = 2.5 // 한 번에 훑는 길이 (초)
const LEAD_GUARD = 0.4 // 창 앞쪽 버리는 길이
const TAIL_WAIT = 0.15 // 이만큼 지난 소리만 확정
const MAX_WIN = 0.12 // 음표 하나에 짝지을 수 있는 최대 거리

export class LiveTracker {
  private timer: ReturnType<typeof setInterval> | null = null
  private busy = false
  private committed = -Infinity // 여기(AudioContext 시각)까지는 확정
  private lastAccepted = -Infinity
  private pool: Heard[] = [] // 확정했지만 아직 음표와 안 짝지은 소리
  private countIn: Heard[] = []
  private bleed: number | null | undefined = undefined // undefined = 아직 안 잼
  private decided = 0 // exp 앞에서부터 결정 끝난 개수
  private matchedS: number[] = []
  private exp: ExpectedHit[] // 바퀴를 이어 붙인 정답 (반복이 아니면 한 바퀴)
  private lapOf: number[] = []
  private perLap: number // 한 바퀴 정답 수
  private loopLen: number | null
  private maxLaps: number
  private clicks: number[] // 같이 튼 클릭 (바퀴마다 되풀이, 정렬됨)
  private lapMarks: Map<number, number | null>[] = []
  private lapExtras: number[][] = []
  private lapJudged: (number | null)[][] = [] // 바퀴별 판정 대상(롤 제외) 오차
  private allDevs: number[] = []
  private curLap = 0
  private rollSpans: [number, number][] = []
  private lat: number | null // 소리 지연 (초). 측정 안 했으면 처음 몇 초 친 걸로 추정
  bleedLevel = 0 // 스피커 반주가 마이크에 들어온 정도 (0~1)

  constructor(
    private audio: PracticeAudio,
    private o: {
      gridOrigin: number
      latency: number | null
      expected: ExpectedHit[] // 한 바퀴 (구간 첫 마디 1박 = 0)
      clickTimes?: number[] // 같이 튼 클릭 (첫 바퀴, 카운트인 포함)
      countInBeats?: number
      metronomeAudible?: boolean
      bleedScale?: number
      loopLen?: number // 구간 반복이면 한 바퀴 길이 (초)
      maxLaps?: number
      onUpdate: (s: LiveState) => void
    },
  ) {
    this.lat = o.latency
    const one = [...o.expected].sort((a, b) => a.t - b.t)
    this.perLap = one.length
    this.loopLen = o.loopLen && o.loopLen > 0 ? o.loopLen : null
    this.maxLaps = this.loopLen ? Math.max(1, o.maxLaps ?? LOOP_MAX_LAPS) : 1
    this.exp = []
    for (let k = 0; k < this.maxLaps; k++)
      for (const e of one) {
        this.exp.push(k ? { ...e, t: e.t + k * (this.loopLen ?? 0) } : e)
        this.lapOf.push(k)
      }
    for (let k = 0; k < this.maxLaps; k++) {
      this.lapMarks.push(new Map())
      this.lapExtras.push([])
      this.lapJudged.push([])
    }
    this.exp.forEach((e, i) => {
      if (e.roll) this.rollSpans.push([e.t - 0.05, i + 1 < this.exp.length ? this.exp[i + 1].t - 0.05 : e.t + 3])
    })
    const ct = o.clickTimes ?? []
    this.clicks = this.loopLen ? loopClicks(ct, this.loopLen, this.maxLaps) : [...ct].sort((a, b) => a - b)
  }

  start() {
    this.timer = setInterval(() => this.tick(), 300)
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private right(i: number) {
    return i + 1 < this.exp.length ? Math.min(MAX_WIN, (this.exp[i + 1].t - this.exp[i].t) / 2) : MAX_WIN
  }

  /** 테스트용으로 밖에서도 부른다 */
  async tick() {
    if (this.busy) return
    this.busy = true
    try {
      const rec = this.audio.recentSamples(WINDOW)
      if (!rec || rec.samples.length < rec.sampleRate * 0.6) return
      const now = this.audio.ctx.currentTime
      const commitTo = now - TAIL_WAIT
      if (commitTo <= this.committed) return
      // 스피커로 튼 반주가 마이크에 새어 들어온 건 빼고 찾는다 (워커에서 — 화면이 안 끊기게)
      const { onsets, bleed } = await detectOnsetsOffThread(rec.samples, rec.sampleRate, { reference: rec.reference, referenceLag: this.lat })
      if (bleed) this.bleedLevel = Math.max(this.bleedLevel, bleed.level)
      const lo = Math.max(this.committed, rec.startTime + LEAD_GUARD)
      for (const on of onsets) {
        const tc = rec.startTime + on.time
        if (tc <= lo || tc > commitTo) continue
        if (tc - this.lastAccepted < 0.03) continue
        this.lastAccepted = tc
        const h = { t: tc - (this.lat ?? 0) - this.o.gridOrigin, w: on.flux, s: on.strength }
        if (h.t < -0.15) this.countIn.push(h)
        else this.pool.push(h)
      }
      this.committed = commitTo
      if (this.lat === null && !this.guessLatency(commitTo - this.o.gridOrigin)) return
      const until = commitTo - (this.lat ?? 0) - this.o.gridOrigin // 구간 기준, 여기까지 들은 셈
      let changed = this.settle(until)
      // 들은 시각이 다음 바퀴로 넘어가면 악보 표시를 비운다 (지난 바퀴 끝 음은 정확도에만 들어간다)
      const lap = this.loopLen ? Math.max(0, Math.min(this.maxLaps - 1, Math.floor(until / this.loopLen))) : 0
      if (lap !== this.curLap) {
        this.curLap = lap
        changed = true
      }
      if (changed) this.emit()
    } catch {
      // 실시간 표시는 보조 기능 — 실패해도 녹음·최종 분석엔 영향 없음
    } finally {
      this.busy = false
    }
  }

  private emit() {
    // 지연 측정 없이 하면 절대 박자를 모르니, 지금까지 친 것의 중앙값을 0으로 (끝난 뒤 '내 평균 기준'과 같은 방식)
    const off = this.o.latency === null ? median(this.allDevs) : 0
    const cur = this.lapMarks[this.curLap]
    const marks = off ? new Map([...cur].map(([k, v]) => [k, v === null ? null : Math.round((v - off) * 10) / 10])) : new Map(cur)
    const done = this.perLap ? Math.min(this.maxLaps, Math.floor(this.decided / this.perLap)) : 0
    const laps: number[] = []
    for (let k = 0; k < done; k++) {
      const ds = this.lapJudged[k]
      const good = ds.filter(d => d !== null && Math.abs(d - off) <= GOOD_MS).length
      laps.push(ds.length ? Math.round((good / ds.length) * 100) : 0)
    }
    this.o.onUpdate({ marks, extras: [...this.lapExtras[this.curLap]], lap: this.curLap, laps })
  }

  // 지연 측정 없이 할 때: 처음 3초쯤 친 소리와 악보가 가장 잘 겹치는 밀림을 지연으로 삼는다 (끝나고 하는 분석과 같은 방법)
  private guessLatency(heardUntil: number): boolean {
    const first = this.exp[0]?.t ?? 0
    const played = this.pool.filter(h => h.t > first - 0.1)
    if (heardUntil < first + 3 || played.length < 8) return false
    const lag = estimateGlobalLag(
      this.exp.filter(e => e.t <= heardUntil).map(e => e.t),
      played.map(h => h.t),
    )
    this.lat = lag
    for (const h of this.pool) h.t -= lag
    for (const h of this.countIn) h.t -= lag
    return true
  }

  // 들을 만큼 들은 음표들을 짝짓고, 더 이상 짝이 될 수 없는 소리는 '악보에 없는 타격'으로 넘긴다
  private settle(until: number): boolean {
    const clicks = this.o.metronomeAudible ? this.clicks : []
    if (this.bleed === undefined && until > 0.05) {
      const ci = clicks.filter(t => t < -0.01).slice(-(this.o.countInBeats ?? 4))
      const lv = clicks.length ? estimateBleed(this.countIn.map(h => h.t), this.countIn.map(h => h.s), ci) : null
      this.bleed = lv === null ? null : lv * (this.o.bleedScale ?? 1)
    }
    let end = this.decided
    while (end < this.exp.length && this.exp[end].t + this.right(end) <= until) end++
    let changed = false
    if (end > this.decided) {
      // 앞뒤 음표를 한 개씩 끼워 넣어 짝지을 범위를 이웃과의 간격 절반으로 맞춘다 (결과는 버림)
      const a = Math.max(0, this.decided - 1)
      const b = Math.min(this.exp.length, end + 1)
      const res = matchHits(this.exp.slice(a, b), this.pool.map(h => h.t), {
        weights: this.pool.map(h => h.w),
        strengths: this.pool.map(h => h.s),
        bleed: this.bleed != null ? { clickTimes: clicks, level: this.bleed } : undefined,
      })
      const used = new Set<number>()
      // 결과는 넣은 순서(시각 순) 그대로 — 바퀴마다 onset idx 가 같아서 idx 로 찾지 않고 자리로 맞춘다
      res.hits.forEach((h, k) => {
        const i = a + k
        if (i < this.decided || i >= end) return
        if (h.played !== null) {
          const j = this.pool.findIndex(x => x.t === h.played)
          if (j >= 0) {
            used.add(j)
            this.matchedS.push(this.pool[j].s)
          }
        }
        if (!h.roll) {
          const lap = this.lapOf[i]
          this.lapMarks[lap].set(h.idx, h.dev)
          this.lapJudged[lap].push(h.dev)
          if (h.dev !== null) this.allDevs.push(h.dev)
        }
        changed = true
      })
      this.pool = this.pool.filter((_, j) => !used.has(j))
      this.decided = end
    }
    // 다음 음표 짝 범위보다 앞선 소리는 이제 짝이 될 수 없다
    const next = this.exp[this.decided]
    const limit = next ? next.t - Math.min(MAX_WIN, this.decided > 0 ? (next.t - this.exp[this.decided - 1].t) / 2 : MAX_WIN) : until
    const typical = median(this.matchedS)
    const spanLo = (this.exp[0]?.t ?? 0) - MAX_WIN
    const spanHi = (this.exp[this.exp.length - 1]?.t ?? 0) + MAX_WIN
    const keep: Heard[] = []
    for (const h of this.pool) {
      if (h.t >= limit) {
        keep.push(h)
        continue
      }
      if (
        this.matchedS.length >= 4 &&
        h.t >= spanLo &&
        h.t <= spanHi &&
        h.s >= typical * 0.25 &&
        !(near(clicks, h.t, 0.012) && h.s < typical * 0.5) &&
        !this.rollSpans.some(([x, y]) => h.t >= x && h.t <= y)
      ) {
        const lap = this.loopLen ? Math.max(0, Math.min(this.maxLaps - 1, Math.floor(h.t / this.loopLen))) : 0
        this.lapExtras[lap].push(h.t - lap * (this.loopLen ?? 0))
        changed = true
      }
    }
    this.pool = keep
    return changed
  }
}

function median(a: number[]) {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  return s[Math.floor(s.length / 2)]
}

// 정렬된 시각 목록에 tol 안으로 가까운 게 있는지
function near(sorted: number[], t: number, tol: number) {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (sorted[m] < t) lo = m + 1
    else hi = m
  }
  return (lo > 0 && t - sorted[lo - 1] < tol) || (lo < sorted.length && sorted[lo] - t < tol)
}

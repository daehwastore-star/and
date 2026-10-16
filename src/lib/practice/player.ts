'use client'

// 파트별 음원(stem)을 한 AudioContext 시계로 같이 튼다.
// 모든 stem 은 같은 시간축이라(0박 = 카운트인 시작) 같은 시각·같은 위치로 시작하면 샘플 단위로 맞는다.
// 파트를 켜고 끄는 건 파트마다 붙은 GainNode 음량만 바꾼다 — 재생은 끊기지 않는다.

import { detectOnsets } from './analysis'
import { mono, type PracticeAudio } from './engine'

export interface StemInfo {
  part: string
  url: string
}

export interface PlayOptions {
  fromBar: number
  toBar: number
  loop: boolean
  maxLaps?: number // 반복할 때 이만큼 돌면 끝낸다 (녹음 안전장치) — 없으면 멈출 때까지
}

interface Session {
  when: number // 이번 재생(첫 바퀴)이 시작된 AudioContext 시각
  offStart: number // 버퍼 안 시작 위치 (초) — 카운트인 1마디 포함
  preroll: number // 카운트인 길이 (초)
  firstLen: number // 첫 바퀴 길이 (초)
  loopStart: number // 반복할 때 버퍼 안 시작 위치
  loopLen: number
  opts: PlayOptions
  sources: AudioBufferSourceNode[]
  started: Set<string> // 이번 재생에서 소리가 나고 있는(소스가 있는) 파트
  joining: Set<string> // 받는 중이라 곧 끼워 넣을 파트
  timer: ReturnType<typeof setTimeout> | null
  nextAt: number // 다음 바퀴 시작 시각 (아직 예약 안 됨)
  pending: number | null // 예약은 됐지만 아직 시작 안 한 바퀴의 시작 시각
  laps: number // 예약한 바퀴 수 (첫 바퀴 포함)
}

export class StemPlayer {
  readonly audio: PracticeAudio
  readonly bpm: number
  readonly beatsPerBar: number
  readonly countInBeats: number
  readonly bars: number
  private stems: Map<string, StemInfo>
  private buffers = new Map<string, AudioBuffer>()
  private loading = new Map<string, Promise<AudioBuffer>>()
  private gains = new Map<string, GainNode>()
  private master: GainNode
  private enabled: Record<string, boolean> = {}
  private volume: Record<string, number> = {}
  private session: Session | null = null
  bar1 = 0 // 버퍼 안에서 1마디 1박 위치 (초)
  timelineOk = false // 메트로놈 음원에서 1마디 위치를 실제로 찾았는지
  onEnded: (() => void) | null = null

  constructor(audio: PracticeAudio, cfg: { bpm: number; beatsPerBar: number; countInBeats: number; bars: number }, stems: StemInfo[]) {
    this.audio = audio
    this.bpm = cfg.bpm
    this.beatsPerBar = cfg.beatsPerBar
    this.countInBeats = cfg.countInBeats
    this.bars = cfg.bars
    this.stems = new Map(stems.map(s => [s.part, s]))
    this.master = audio.ctx.createGain()
    this.master.connect(audio.ctx.destination)
    this.bar1 = this.countInBeats * this.spb
  }

  get spb() {
    return 60 / this.bpm
  }
  get barLen() {
    return this.beatsPerBar * this.spb
  }
  get parts() {
    return [...this.stems.keys()]
  }
  isLoaded(part: string) {
    return this.buffers.has(part)
  }

  /** 음원 받기·풀기 (한 번만) */
  load(part: string): Promise<AudioBuffer> {
    const done = this.buffers.get(part)
    if (done) return Promise.resolve(done)
    let p = this.loading.get(part)
    if (!p) {
      const info = this.stems.get(part)
      if (!info) return Promise.reject(new Error(`no stem ${part}`))
      p = this.audio.decode(info.url).then(buf => {
        this.buffers.set(part, buf)
        this.loading.delete(part)
        return buf
      })
      p.catch(() => this.loading.delete(part))
      this.loading.set(part, p)
    }
    return p
  }

  /**
   * 메트로놈 음원의 첫 소리(카운트인 첫 스틱)로 1마디 위치를 정한다.
   * mp3 는 인코더가 앞에 수십 ms 를 덧붙이고 브라우저마다 이걸 빼거나 안 빼서, 실제 버퍼에서 찾아야 정확하다.
   */
  async calibrateTimeline() {
    if (!this.stems.has('metronome')) return
    const buf = await this.load('metronome')
    const sr = buf.sampleRate
    const pad = Math.round(sr * 0.3)
    const head = mono(buf, Math.round(sr * (this.countInBeats * this.spb + 1)))
    const x = new Float32Array(pad + head.length)
    x.set(head, pad) // 앞에 0.3초 무음을 붙여야 맨 첫 소리도 놓치지 않는다
    const onsets = (await detectOnsets(x, sr)).map(o => o.time - 0.3).filter(t => t > -0.05)
    this.timelineOk = true // 받아서 훑어봤으면 됐다 (아래에서 못 믿겠으면 이론값 유지)
    if (!onsets.length) return
    const first = onsets[0]
    // 두 번째 스틱이 한 박 뒤에 있는지 확인
    const second = onsets.find(t => Math.abs(t - first - this.spb) < 0.02)
    if (second !== undefined || this.countInBeats <= 1) this.bar1 = Math.max(0, first) + this.countInBeats * this.spb
  }

  private gainOf(part: string): GainNode {
    let g = this.gains.get(part)
    if (!g) {
      g = this.audio.ctx.createGain()
      g.gain.value = 0
      g.connect(this.master)
      this.gains.set(part, g)
    }
    return g
  }

  private level(part: string) {
    return this.enabled[part] ? (this.volume[part] ?? 1) : 0
  }

  setEnabled(part: string, on: boolean) {
    this.enabled[part] = on
    this.applyGain(part)
    // 이번 재생에 소스가 없는 파트(늦게 받아졌거나 시작 뒤에 켠 것)는 지금 위치에 끼워 넣는다
    const s = this.session
    if (on && s && !s.started.has(part) && !s.joining.has(part)) this.joinLate(part)
  }

  /** 메트로놈 음량: 카운트인 때 / 곡 중 — 카운트인으로 잰 스피커 새는 소리 크기를 곡 중 크기로 바꿀 때 쓴다 */
  metronomeGains() {
    const song = this.level('metronome')
    return { countIn: Math.max(0.8, song), song }
  }

  setVolume(part: string, v: number) {
    this.volume[part] = v
    this.applyGain(part)
  }

  private applyGain(part: string) {
    const g = this.gainOf(part)
    const now = this.audio.ctx.currentTime
    const s = this.session
    // 카운트인 중엔 메트로놈만 (그 뒤 값은 play 에서 예약해 둔다)
    if (s && now < s.when + s.preroll) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(part === 'metronome' ? Math.max(0.8, this.level(part)) : 0, now)
      g.gain.setValueAtTime(this.level(part), s.when + s.preroll)
      return
    }
    g.gain.cancelScheduledValues(now)
    g.gain.setTargetAtTime(this.level(part), now, 0.015)
  }

  barOffset(bar: number) {
    return this.bar1 + (bar - 1) * this.barLen
  }

  /** 지금 몇 마디 몇 박 (재생 중이 아니면 null). 카운트인 중이면 bar=0. lap = 몇 번째 바퀴 (1부터, 반복 아니면 1) */
  position(): { bar: number; beat: number; countIn: number; lap: number } | null {
    const s = this.session
    if (!s) return null
    const now = this.audio.ctx.currentTime
    let t: number // 버퍼 안 위치
    let lap = 1
    if (now < s.when + s.firstLen || !s.opts.loop) t = s.offStart + Math.min(s.firstLen, Math.max(0, now - s.when))
    else {
      t = s.loopStart + ((now - s.when - s.firstLen) % s.loopLen)
      lap = Math.min(s.laps, 2 + Math.floor((now - s.when - s.firstLen) / s.loopLen))
    }
    const rel = t - this.bar1
    if (now < s.when + s.preroll) {
      return { bar: 0, beat: -1, countIn: Math.min(this.countInBeats, Math.floor((now - s.when) / this.spb) + 1), lap }
    }
    const beatIdx = Math.floor(rel / this.spb + 1e-6)
    return { bar: Math.floor(beatIdx / this.beatsPerBar) + 1, beat: beatIdx % this.beatsPerBar, countIn: 0, lap }
  }

  /** 지금 박 (1마디 1박 = 0, 소수). 재생 중이 아니면 null — 진행선용 */
  beatNow(): number | null {
    const s = this.session
    if (!s) return null
    const now = this.audio.ctx.currentTime - (this.audio.ctx.outputLatency || 0)
    let t: number
    if (now < s.when + s.firstLen || !s.opts.loop) t = s.offStart + Math.min(s.firstLen, now - s.when)
    else t = s.loopStart + ((now - s.when - s.firstLen) % s.loopLen)
    return (t - this.bar1) / this.spb
  }

  get playing() {
    return !!this.session
  }

  /**
   * 재생. 시작 마디 앞에 카운트인 1마디(메트로놈 소리만)를 넣는다.
   * 돌려주는 gridOrigin = 시작 마디 1박이 실제로 나오는 AudioContext 시각 (박자 체크 녹음 분석에 쓴다)
   */
  async play(opts: PlayOptions): Promise<{ when: number; gridOrigin: number; clickTimes: number[]; loopLen: number }> {
    this.stop()
    const want = this.parts.filter(p => this.enabled[p] || p === 'metronome')
    await Promise.all(want.map(p => this.load(p)))
    const ctx = this.audio.ctx
    await ctx.resume()
    const preroll = this.countInBeats * this.spb
    const offStart = Math.max(0, this.barOffset(opts.fromBar) - preroll)
    const realPreroll = this.barOffset(opts.fromBar) - offStart
    const loopStart = this.barOffset(opts.fromBar)
    const loopEnd = this.barOffset(opts.toBar + 1)
    // 반복이 아니고 곡 끝까지면 마지막 울림까지 조금 더
    const firstEnd = !opts.loop && opts.toBar >= this.bars ? loopEnd + 2.5 : loopEnd
    const when = ctx.currentTime + 0.15
    const s: Session = {
      when,
      offStart,
      preroll: realPreroll,
      firstLen: firstEnd - offStart,
      loopStart,
      loopLen: loopEnd - loopStart,
      opts,
      sources: [],
      started: new Set(),
      joining: new Set(),
      timer: null,
      nextAt: when + (firstEnd - offStart),
      pending: null,
      laps: 1,
    }
    this.session = s
    for (const part of this.parts) {
      const g = this.gainOf(part)
      g.gain.cancelScheduledValues(0)
      g.gain.setValueAtTime(part === 'metronome' ? Math.max(0.8, this.level(part)) : 0, when)
      g.gain.setValueAtTime(this.level(part), when + realPreroll)
      if (this.buffers.has(part)) this.startSource(part, when, offStart, s.firstLen)
    }
    // 받는 동안 새로 켠 파트도 끼워 넣는다
    for (const part of this.parts) if (this.enabled[part] && !s.started.has(part)) this.joinLate(part)
    if (opts.loop) this.scheduleNextLoop(s)
    else this.scheduleFinish(s)
    const clickTimes: number[] = []
    const beats = Math.round(s.firstLen / this.spb)
    for (let k = 0; k <= beats; k++) clickTimes.push(offStart + k * this.spb - loopStart)
    return { when, gridOrigin: when + realPreroll, clickTimes, loopLen: s.loopLen }
  }

  private startSource(part: string, at: number, offset: number, duration: number) {
    const buf = this.buffers.get(part)
    const s = this.session
    if (!buf || !s) return
    const src = this.audio.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.gainOf(part))
    src.start(at, Math.max(0, offset), Math.max(0.01, duration))
    s.sources.push(src)
    s.started.add(part)
    src.onended = () => {
      s.sources = s.sources.filter(x => x !== src)
    }
  }

  // 반복: 다음 바퀴를 끝나기 1초 전에 정확한 시각으로 예약. 정한 바퀴 수를 다 돌면 그 바퀴 끝에서 끝낸다
  private scheduleNextLoop(s: Session) {
    if (s.opts.maxLaps && s.laps >= s.opts.maxLaps) return this.scheduleFinish(s)
    const ctx = this.audio.ctx
    const lead = Math.max(0, (s.nextAt - ctx.currentTime - 1) * 1000)
    s.timer = setTimeout(() => {
      if (this.session !== s) return
      const at = s.nextAt
      for (const part of this.parts) if (this.buffers.has(part)) this.startSource(part, at, s.loopStart, s.loopLen)
      s.pending = at
      s.nextAt = at + s.loopLen
      s.laps++
      this.scheduleNextLoop(s)
    }, lead)
  }

  // 재생 중에 켠 파트가 아직 안 받아졌으면, 받는 대로 지금 위치에 맞춰 끼워 넣는다
  private async joinLate(part: string) {
    const s = this.session
    if (!s) return
    s.joining.add(part)
    try {
      await this.load(part)
    } catch {
      return
    } finally {
      s.joining.delete(part)
    }
    if (this.session !== s || s.started.has(part)) return
    const at = Math.max(this.audio.ctx.currentTime + 0.05, s.when) // 아직 시작 전이면 시작 시각에 같이
    if (at < s.when + s.firstLen) {
      this.startSource(part, at, s.offStart + (at - s.when), s.when + s.firstLen - at)
    } else {
      const into = (at - s.when - s.firstLen) % s.loopLen
      this.startSource(part, at, s.loopStart + into, s.loopLen - into)
    }
    // 다음 바퀴가 이미 예약됐으면 그 바퀴에도 넣는다
    if (s.opts.loop && s.pending !== null && s.pending > at) this.startSource(part, s.pending, s.loopStart, s.loopLen)
    this.applyGain(part)
  }

  /**
   * 한 마디만 미리 듣기: 메트로놈 1마디(카운트) 뒤에 그 파트 원곡 소리 1마디. 재생 중인 연습과 따로 논다.
   * 돌려주는 값 = 끝나는 데 걸리는 초
   */
  async previewBar(part: string, bar: number, withClick = true): Promise<number> {
    this.stop()
    const parts = [part, ...(withClick ? ['metronome'] : [])].filter(p => this.stems.has(p))
    await Promise.all(parts.map(p => this.load(p)))
    const ctx = this.audio.ctx
    await ctx.resume()
    const when = ctx.currentTime + 0.1
    const lead = this.barLen
    const segStart = this.barOffset(bar) - lead
    const dur = lead + this.barLen + 0.4
    for (const p of parts) {
      const buf = this.buffers.get(p)
      if (!buf) continue
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.setValueAtTime(p === 'metronome' ? 0.9 : 0, when)
      if (p !== 'metronome') g.gain.setValueAtTime(1, when + lead - 0.02)
      src.connect(g).connect(this.master)
      src.start(when, Math.max(0, segStart), dur)
      this.audio.track(src)
    }
    return dur + 0.1
  }

  // 끝 시각은 오디오 시계 기준 — 전화·알림으로 오디오가 멈췄다 다시 돌면 그만큼 늦게 끝낸다
  private scheduleFinish(s: Session) {
    const left = s.nextAt - this.audio.ctx.currentTime
    s.timer = setTimeout(() => {
      if (this.session !== s) return
      if (this.audio.ctx.currentTime < s.nextAt - 0.02) return this.scheduleFinish(s)
      this.finish(s)
    }, Math.max(0, left) * 1000 + 80)
  }

  private finish(s: Session) {
    if (this.session !== s) return
    this.stop()
    this.onEnded?.()
  }

  stop() {
    const s = this.session
    if (!s) return
    this.session = null
    if (s.timer) clearTimeout(s.timer)
    for (const src of s.sources) {
      try {
        src.stop()
      } catch {}
    }
    const now = this.audio.ctx.currentTime
    for (const g of this.gains.values()) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(0, now)
    }
  }

  dispose() {
    this.stop()
    try {
      this.master.disconnect()
    } catch {}
    this.buffers.clear()
  }
}

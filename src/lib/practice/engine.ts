'use client'

// 브라우저 오디오: 마이크 녹음(AudioWorklet) + 반주 재생을 한 AudioContext 시계로 맞춘다.
// 녹음 샘플마다 AudioContext 시각을 알 수 있어서, "몇 시에 클릭을 틀었는데 몇 시에 쳤다"를 샘플 단위로 비교할 수 있다.

const WORKLET = `
class PracticeRecorder extends AudioWorkletProcessor {
  constructor() {
    super()
    this.on = true
    this.buf = new Float32Array(4096)
    this.n = 0
    this.start = -1
    this.port.onmessage = e => { if (e.data === 'stop') { this.flush(); this.on = false } }
  }
  flush() {
    if (this.n > 0) {
      this.port.postMessage({ frame: this.start, data: this.buf.slice(0, this.n) })
      this.n = 0
      this.start = -1
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    if (ch && ch.length) {
      if (this.start < 0) this.start = currentFrame
      // 이어지지 않거나(끊김) 버퍼가 차면 지금까지 것을 보내고 새로 시작
      if (this.start + this.n !== currentFrame || this.n + ch.length > this.buf.length) {
        this.flush()
        this.start = currentFrame
      }
      this.buf.set(ch, this.n)
      this.n += ch.length
    }
    return this.on
  }
}
registerProcessor('practice-recorder', PracticeRecorder)
`

export interface Recording {
  samples: Float32Array
  sampleRate: number
  startTime: number // samples[0] 의 AudioContext 시각 (초)
}

interface NavigatorWithAudioSession extends Navigator {
  audioSession?: { type: string }
}

export class PracticeAudio {
  ctx: AudioContext
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private node: AudioWorkletNode | null = null
  private chunks: { frame: number; data: Float32Array }[] = []
  private playing: AudioBufferSourceNode[] = []
  private closed = false

  private constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  /** 아이폰 오디오 세션: 듣기만 할 땐 'playback'(무음 스위치·볼륨이 음악처럼), 녹음할 땐 'play-and-record' */
  static setSession(type: 'playback' | 'play-and-record' | 'auto') {
    try {
      const nav = navigator as NavigatorWithAudioSession
      if (nav.audioSession) nav.audioSession.type = type
    } catch {}
  }

  /** 반드시 버튼 누름(사용자 동작) 안에서 부른다 — 아이폰은 그때만 소리·마이크를 열어준다 */
  static async open(session: 'playback' | 'play-and-record' = 'play-and-record'): Promise<PracticeAudio> {
    PracticeAudio.setSession(session)
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx({ latencyHint: 'interactive' })
    await ctx.resume()
    return new PracticeAudio(ctx)
  }

  private workletReady: Promise<void> | null = null

  private loadWorklet(): Promise<void> {
    if (!this.workletReady) {
      if (!this.ctx.audioWorklet) return Promise.reject(new Error('이 브라우저는 녹음 기능(AudioWorklet)을 지원하지 않아요. 최신 사파리·크롬에서 열어 주세요.'))
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }))
      this.workletReady = this.ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
      this.workletReady.catch(() => {
        this.workletReady = null // 다음에 다시 시도
      })
    }
    return this.workletReady
  }

  private micOpening: Promise<void> | null = null

  /** 마이크 열기 — 에코 제거·잡음 제거·자동 음량은 끈다 (타격 순간이 뭉개지지 않게). 두 번 눌러도 한 번만 연다 */
  openMic(): Promise<void> {
    if (this.stream) return Promise.resolve()
    if (!this.micOpening) this.micOpening = this.doOpenMic().finally(() => (this.micOpening = null))
    return this.micOpening
  }

  private async doOpenMic() {
    await this.loadWorklet()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    })
    if (this.closed) {
      stream.getTracks().forEach(t => t.stop())
      throw new Error('closed')
    }
    this.source = this.ctx.createMediaStreamSource(stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 4096
    this.source.connect(this.analyser)
    this.stream = stream
  }

  /** 마이크 놓기 (녹음 끝나면 바로 — 폰 상단 마이크 표시가 꺼진다) */
  closeMic() {
    try {
      this.source?.disconnect()
    } catch {}
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    this.source = null
    this.analyser = null
  }

  /** 지금 마이크로 들어오는 소리 (튜너용) */
  micSamples(out: Float32Array): boolean {
    const a = this.analyser
    if (!a) return false
    if (out.length >= a.fftSize) {
      a.getFloatTimeDomainData(out as Float32Array<ArrayBuffer>)
      return true
    }
    // 짧게 달라면 가장 최근 소리(뒤쪽)를 준다
    if (!this.micTmp || this.micTmp.length !== a.fftSize) this.micTmp = new Float32Array(a.fftSize)
    a.getFloatTimeDomainData(this.micTmp as Float32Array<ArrayBuffer>)
    out.set(this.micTmp.subarray(a.fftSize - out.length))
    return true
  }
  private micTmp: Float32Array | null = null

  get micReady() {
    return !!this.stream
  }

  /** 지금 마이크 소리 크기 (0~1) */
  level(): number {
    if (!this.analyser) return 0
    const a = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(a)
    let peak = 0
    for (const v of a) peak = Math.max(peak, Math.abs(v))
    return peak
  }

  startRecording() {
    if (!this.source) throw new Error('마이크가 열리지 않았어요')
    this.chunks = []
    const node = new AudioWorkletNode(this.ctx, 'practice-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' })
    node.port.onmessage = e => this.chunks.push(e.data)
    this.source.connect(node)
    // 출력에 연결해야 처리가 돈다 (소리는 0)
    const mute = this.ctx.createGain()
    mute.gain.value = 0
    node.connect(mute).connect(this.ctx.destination)
    this.node = node
  }

  /** 녹음 중 최근 seconds 초 (실시간 표시용). startTime = 첫 샘플의 AudioContext 시각 */
  recentSamples(seconds: number): Recording | null {
    const sr = this.ctx.sampleRate
    const want = Math.round(seconds * sr)
    const parts: { frame: number; data: Float32Array }[] = []
    let n = 0
    for (let i = this.chunks.length - 1; i >= 0 && n < want; i--) {
      parts.unshift(this.chunks[i])
      n += this.chunks[i].data.length
    }
    if (!parts.length) return null
    const first = parts[0].frame
    const last = parts[parts.length - 1]
    const total = last.frame + last.data.length - first
    const samples = new Float32Array(total)
    for (const c of parts) samples.set(c.data, c.frame - first)
    return { samples, sampleRate: sr, startTime: first / sr }
  }

  async stopRecording(): Promise<Recording> {
    const node = this.node
    if (!node) throw new Error('녹음 중이 아니에요')
    node.port.postMessage('stop')
    // 마지막 조각이 도착할 때까지 잠깐 기다림
    await new Promise(r => setTimeout(r, 150))
    try {
      this.source?.disconnect(node)
    } catch {}
    node.disconnect()
    this.node = null
    const chunks = this.chunks
    this.chunks = []
    if (!chunks.length) return { samples: new Float32Array(0), sampleRate: this.ctx.sampleRate, startTime: 0 }
    chunks.sort((a, b) => a.frame - b.frame)
    const first = chunks[0].frame
    const last = chunks[chunks.length - 1]
    const total = last.frame + last.data.length - first
    const samples = new Float32Array(total)
    for (const c of chunks) samples.set(c.data, c.frame - first) // 끊긴 자리는 0 으로 남는다
    return { samples, sampleRate: this.ctx.sampleRate, startTime: first / this.ctx.sampleRate }
  }

  makeBuffer(channels: Float32Array[]): AudioBuffer {
    const buf = this.ctx.createBuffer(channels.length, channels[0].length, this.ctx.sampleRate)
    channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    return buf
  }

  /** when(AudioContext 시각)에 재생. offset/duration 은 버퍼 안 초 */
  play(buf: AudioBuffer, when: number, offset = 0, duration?: number, gain = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const g = this.ctx.createGain()
    g.gain.value = gain
    src.connect(g).connect(this.ctx.destination)
    src.start(Math.max(when, this.ctx.currentTime), Math.max(0, offset), duration)
    this.playing.push(src)
    src.onended = () => {
      this.playing = this.playing.filter(p => p !== src)
    }
    return src
  }

  /** 따로 만든 소스도 stopAll 로 같이 멈추게 등록 */
  track(src: AudioBufferSourceNode) {
    this.playing.push(src)
    src.addEventListener('ended', () => {
      this.playing = this.playing.filter(p => p !== src)
    })
  }

  stopAll() {
    for (const p of this.playing) {
      try {
        p.stop()
      } catch {}
    }
    this.playing = []
  }

  async decode(url: string): Promise<AudioBuffer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error('음원을 불러오지 못했어요')
    const data = await res.arrayBuffer()
    return await this.ctx.decodeAudioData(data)
  }

  async close() {
    this.closed = true
    this.stopAll()
    this.closeMic()
    PracticeAudio.setSession('auto')
    try {
      await this.ctx.close()
    } catch {}
  }
}

/** 버퍼를 채널별 Float32Array 로 */
export function channelsOf(buf: AudioBuffer): Float32Array[] {
  return Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
}

/** 여러 채널을 모노로 (length 를 주면 앞부분만) */
export function mono(buf: AudioBuffer, length = buf.length): Float32Array {
  const n = Math.min(length, buf.length)
  const out = new Float32Array(n)
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels
  }
  return out
}

// engrave() 결과 → VexFlow 로 실제 악보(SVG) 그리기. 브라우저 전용.
// VexFlow 는 무거워서 연습 화면에서만 import('vexflow/bravura') 로 불러와 여기로 넘긴다 (타입만 정적으로).
// 그리고 나서 진행선·내 타격 표시가 쓸 좌표(마디별 박→x, 타격별 음표머리 자리)를 뽑아 돌려준다.

import type * as VexNS from 'vexflow/bravura'
import type { EStaff, ETick, Engraved } from '@/lib/practice/engrave'
import { DRUM_POS, DRUM_XHEAD, type Onset, type PartScore } from '@/lib/practice/score'

type VF = typeof VexNS
type StaveNote = VexNS.StaveNote
type Stave = VexNS.Stave

/** 음표머리 하나 (겹쳐 그리기용: 같은 글리프를 같은 자리에) */
export interface Head {
  x: number // 글리프 왼쪽 (SVG text x)
  y: number // 기준선 (SVG text y)
  w: number
  glyph: string
  size: string // font-size (VexFlow 와 같은 값, 예: 30pt)
}

export interface OnsetGeo {
  idx: number
  row: number
  x: number // 음표머리 가운데
  top: number
  bottom: number
  heads: Head[]
}

export interface MeasureGeo {
  m: number
  row: number
  x0: number // 마디 왼쪽 (줄 첫 마디면 음자리표 포함)
  x1: number
  /** 마디 안 박 → x 꺾은선 (박은 마디 첫 박 = 0). 실제 그려진 음표 자리 기준 */
  pts: [number, number][]
}

export interface RowGeo {
  top: number // 이 줄이 차지하는 위·아래 (마디 칠하기·진행선 높이)
  bottom: number
  staffTop: number // 첫 오선 맨 윗줄
  staffBottom: number // 마지막 오선 맨 아랫줄
  ms: number[]
}

export interface Layout {
  scale: number // VexFlow 단위 → 화면 px
  width: number // VexFlow 단위
  height: number
  bpb: number
  rows: RowGeo[]
  measures: Map<number, MeasureGeo>
  onsets: Map<number, OnsetGeo>
  ms: number // 그리는 데 걸린 시간 (누적)
}

const NAMES = 'cdefgab'
const ACC: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: 'n', 1: '#', 2: '##' }
const SHARP_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#']
const FLAT_KEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']
const OPEN_GLYPH = '\uE5E7' // brassMuteOpen — 오픈 하이햇 'o'

// VexFlow 가 그릴 때마다 상태를 structuredClone 으로 복사하고 글자 폭을 매번 canvas 로 재서 85마디면 느리다.
// 값이 전부 문자열·숫자인 얕은 객체라 펼쳐 복사로 충분하고, 글자 폭은 (글꼴, 글자) 마다 한 번만 잰다.
// 글꼴(Bravura)이 다 받아진 뒤에 불러야 한다 (잘못 잰 폭이 캐시에 남지 않게).
let patched = false
export function speedUpVexFlow(VF: VF) {
  if (patched) return
  patched = true
  type Rec = Record<string, unknown>
  const ctxProto = VF.SVGContext.prototype as unknown as { save(): unknown; restore(): unknown }
  ctxProto.save = function (this: { stateStack: Rec[]; state: Rec; attributes: Rec }) {
    this.stateStack.push({ state: { ...this.state }, attributes: { ...this.attributes } })
    return this
  }
  ctxProto.restore = function (this: { stateStack: { state: Rec; attributes: Rec }[]; state: Rec; attributes: Rec }) {
    const s = this.stateStack.pop()
    if (s) {
      this.state = { ...s.state }
      this.attributes = { ...s.attributes }
    }
    return this
  }
  const M = VF.Metrics as unknown as {
    get(key: string, def?: unknown): unknown
    getFontInfo(key: string): Rec
    getStyle(key: string): Rec
  }
  const origGet = M.get.bind(M)
  const getCache = new Map<string, unknown>()
  M.get = (key: string, def?: unknown) => {
    const k = def === undefined ? key : `${key}\u0000${String(def)}`
    if (getCache.has(k)) return getCache.get(k)
    const v = origGet(key, def)
    if (v === null || typeof v !== 'object') getCache.set(k, v)
    return v
  }
  const fontCache = new Map<string, Rec>()
  M.getFontInfo = (key: string) => {
    let f = fontCache.get(key)
    if (!f) {
      f = {
        family: M.get(`${key}.fontFamily`),
        size: (M.get(`${key}.fontSize`) as number) * (M.get(`${key}.fontScale`) as number),
        weight: M.get(`${key}.fontWeight`),
        style: M.get(`${key}.fontStyle`),
      }
      fontCache.set(key, f)
    }
    return { ...f }
  }
  const styleCache = new Map<string, Rec>()
  M.getStyle = (key: string) => {
    let s = styleCache.get(key)
    if (!s) {
      s = {}
      for (const p of ['fillStyle', 'strokeStyle', 'lineWidth', 'lineDash', 'shadowBlur', 'shadowColor']) s[p] = M.get(`${key}.${p}`)
      styleCache.set(key, s)
    }
    return Array.isArray(s.lineDash) ? { ...s, lineDash: [...s.lineDash] } : { ...s }
  }
  const El = VF.Element as unknown as { prototype: Rec; getTextMeasurementCanvas(): HTMLCanvasElement | OffscreenCanvas | undefined }
  const FontC = VF.Font as unknown as { toCSSString(f: unknown): string; validate(f: unknown): unknown }
  const textCache = new Map<string, TextMetrics>()
  El.prototype.measureText = function (this: Rec & { fontInfo: unknown; text: string }) {
    const font = FontC.toCSSString(FontC.validate(this.fontInfo))
    const k = `${font}\u0000${this.text}`
    let m = textCache.get(k)
    if (!m) {
      const c = El.getTextMeasurementCanvas()?.getContext('2d') as CanvasRenderingContext2D | null
      if (!c) return this._textMetrics
      c.font = font
      m = c.measureText(this.text)
      textCache.set(k, m)
    }
    this._textMetrics = m
    this._height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
    this._width = m.width
    this.metricsValid = true
    return m
  }
}

/** 화면 폭 → 크기 (VexFlow 줄 간격 10 단위 → 폰·앱 폭(~500px)은 6.2px, 넓은 화면은 8.5px 까지) */
export function scaleFor(cssWidth: number): number {
  return cssWidth < 600 ? 0.62 : Math.min(0.85, 0.62 + (cssWidth - 600) * 0.0004)
}

function drumKey(inst: string): string {
  const dia = 38 - (DRUM_POS[inst] ?? 3) // 오선 맨 윗줄 = F5 (38)
  const head = inst === 'rim' ? '/cx' : DRUM_XHEAD.has(inst) ? '/x' : ''
  return `${NAMES[dia % 7]}/${Math.floor(dia / 7)}${head}`
}

// 쉼표 자리: 한 성부면 가운데, 드럼 두 성부면 위·아래로 비켜서 (온쉼표는 줄에 매달리고 2분쉼표는 줄 위에 앉는다)
function restKey(t: ETick, clef: EStaff['clef'], stem: 'up' | 'down' | 'auto', twoVoices: boolean): string {
  const whole = t.dur === 'w'
  const half = t.dur === 'h'
  if (clef === 'percussion' && twoVoices) {
    if (stem === 'up') return whole ? 'f/5' : half ? 'd/5' : 'e/5'
    return whole ? 'g/4' : half ? 'e/4' : 'f/4'
  }
  if (clef === 'bass') return whole ? 'f/3' : 'd/3'
  return whole ? 'd/5' : 'b/4'
}

interface VoiceB {
  stem: 'up' | 'down' | 'auto'
  ticks: ETick[]
  notes: StaveNote[]
  voice: VexNS.Voice
}
interface StaffB {
  clef: EStaff['clef']
  voices: VoiceB[]
}
interface MeasureB {
  m: number
  staves: StaffB[]
  beams: VexNS.Beam[]
  tuplets: VexNS.Tuplet[]
  formatter: VexNS.Formatter
  minW: number
}

/** 박마다 들보로 묶을 음표 번호들. 같은 박 안에서만, 사이 쉼표는 들보 아래로. 8분 둘씩인 박 둘은 반 마디로 이어 묶는다 */
function beamGroups(ticks: ETick[], bpb: number): number[][] {
  const short = (t: ETick) => t.kind === 'note' && (t.dur === '8' || t.dur === '16' || t.dur === '32' || t.dur === '64')
  const shortRest = (t: ETick) => t.kind === 'rest' && t.len < 1 - 1e-6
  const byBeat = new Map<number, number[]>()
  ticks.forEach((t, i) => {
    if (!short(t) && !shortRest(t)) return
    const b = Math.floor(t.start + 1e-6)
    if (Math.floor(t.start + t.len - 1e-6) !== b) return // 박을 넘는 음은 따로
    if (!byBeat.has(b)) byBeat.set(b, [])
    byBeat.get(b)!.push(i)
  })
  const out: { beat: number; idx: number[]; plain8: boolean }[] = []
  for (const [beat, idx] of byBeat) {
    // 박 안에서 이어진 것끼리 (사이에 긴 음이 끼면 끊기)
    let run: number[] = []
    const flush = () => {
      // 앞뒤 쉼표는 빼고 음표가 둘 이상이면 들보
      while (run.length && ticks[run[0]].kind === 'rest') run.shift()
      while (run.length && ticks[run[run.length - 1]].kind === 'rest') run.pop()
      if (run.filter(i => ticks[i].kind === 'note').length >= 2) {
        const plain8 = run.length === 2 && run.every(i => ticks[i].dur === '8' && !ticks[i].dots && !ticks[i].tuplet && ticks[i].kind === 'note')
        out.push({ beat, idx: run, plain8 })
      }
      run = []
    }
    for (const i of idx) {
      if (run.length && run[run.length - 1] !== i - 1) flush()
      run.push(i)
    }
    flush()
  }
  out.sort((a, b) => a.beat - b.beat)
  // 4/4 처럼 2박 묶음이면 8분 둘 + 8분 둘 → 넷을 한 들보로 (인쇄 악보처럼)
  const merged: number[][] = []
  for (let k = 0; k < out.length; k++) {
    const a = out[k]
    const b = out[k + 1]
    if (b && a.plain8 && b.plain8 && b.beat === a.beat + 1 && a.beat % 2 === 0 && bpb % 2 === 0 && bpb !== 6) {
      merged.push([...a.idx, ...b.idx])
      k++
    } else merged.push(a.idx)
  }
  return merged
}

function buildMeasure(VF: VF, mm: Engraved['measures'][number], eng: Engraved, openMarks: Set<ETick>): MeasureB {
  const drums = eng.type === 'drums'
  const beams: VexNS.Beam[] = []
  const tuplets: VexNS.Tuplet[] = []
  const formatter = new VF.Formatter()
  const staves: StaffB[] = mm.staves.map(st => {
    const clef = st.clef === 'treble8' ? 'treble' : st.clef
    const two = st.voices.length > 1
    const voices = st.voices.map(v => {
      const notes = v.ticks.map(t => {
        let keys: string[]
        if (t.kind === 'rest') keys = [restKey(t, st.clef, v.stem, two)]
        else if (drums) keys = t.keys!.map(k => drumKey(k.inst!))
        else keys = t.keys!.map(k => `${NAMES[k.step!]}/${k.octave}`)
        const n = new VF.StaveNote({
          keys,
          duration: t.dur + 'd'.repeat(t.dots) + (t.kind === 'rest' ? 'r' : ''),
          clef,
          ...(v.stem === 'auto' ? { autoStem: true } : { stemDirection: v.stem === 'up' ? 1 : -1 }),
          ...(t.measureRest ? { alignCenter: true, durationOverride: new VF.Fraction(eng.beatsPerBar, 4) } : {}),
        })
        if (t.dots) VF.Dot.buildAndAttach([n], { all: true })
        if (t.kind === 'note') {
          t.keys!.forEach((k, ki) => {
            if (!drums && k.showAcc) n.addModifier(new VF.Accidental(ACC[k.alter ?? 0] ?? 'n'), ki)
            if (k.inst === 'hihat-open' && openMarks.has(t)) n.addModifier(new VF.Articulation(OPEN_GLYPH).setPosition(VF.Modifier.Position.ABOVE), ki)
          })
          if (t.roll) n.addModifier(new VF.Tremolo(3), 0)
        }
        return n
      })
      return { stem: v.stem, ticks: v.ticks, notes }
    })
    // 들보 (기둥 방향: 드럼은 성부대로, 음높이 악보는 묶음 전체로 정한다)
    for (const v of voices) {
      for (const g of beamGroups(v.ticks, eng.beatsPerBar)) {
        const b = new VF.Beam(g.map(i => v.notes[i]), v.stem === 'auto')
        beams.push(b)
      }
    }
    // 잇단음표 (들보가 다 걸렸으면 괄호 없이 숫자만)
    for (const v of voices) {
      const groups = new Map<number, number[]>()
      v.ticks.forEach((t, i) => {
        if (!t.tuplet) return
        if (!groups.has(t.tuplet.id)) groups.set(t.tuplet.id, [])
        groups.get(t.tuplet.id)!.push(i)
      })
      for (const idx of groups.values()) {
        const ns = idx.map(i => v.notes[i])
        const tp = v.ticks[idx[0]].tuplet!
        const down = v.stem === 'down' || (v.stem === 'auto' && ns[0].getStemDirection() === -1)
        tuplets.push(
          new VF.Tuplet(ns, {
            numNotes: tp.num,
            notesOccupied: tp.inSpaceOf,
            ratioed: false,
            bracketed: ns.some(n => !n.hasBeam()),
            location: down ? -1 : 1,
          }),
        )
      }
    }
    const built: VoiceB[] = voices.map(v => {
      const voice = new VF.Voice({ numBeats: eng.beatsPerBar, beatValue: 4 })
      voice.addTickables(v.notes)
      return { ...v, voice }
    })
    formatter.joinVoices(built.map(v => v.voice))
    return { clef: st.clef, voices: built }
  })
  const all = staves.flatMap(s => s.voices.map(v => v.voice))
  const minW = formatter.preCalculateMinTotalWidth(all)
  return { m: mm.m, staves, beams, tuplets, formatter, minW }
}

// 마디 폭 = 최소 폭 × 여유 + 마디 앞뒤 여백. 촘촘한 스트로크 마디는 자연히 넓어져 한 줄에 적게 들어간다
const DENS = 1.2
const MPAD = 22
const MIN_MW = 96

/** 박 길이에 따른 음표 사이 간격 (8분음표 = 1). 길수록 넓게, 짧아도 너무 붙지 않게 */
function spaceFor(d: number): number {
  return d >= 0.5 ? 1 + 0.5 * Math.log2(2 * d) : Math.max(0.6, 1 + 0.16 * Math.log2(2 * d))
}

/** 마디의 '보기 좋은' 폭: 시작 시점마다 다음 시작까지 길이로 간격 + 임시표·점 자리 */
function idealWidth(mm: Engraved['measures'][number], bpb: number, s8: number): number {
  const starts = new Map<number, { acc: number; dot: boolean; second: boolean }>()
  for (const st of mm.staves)
    for (const v of st.voices)
      for (const t of v.ticks) {
        if (t.measureRest) continue
        const k = Math.round(t.start * 1e4) / 1e4
        const e = starts.get(k) ?? { acc: 0, dot: false, second: false }
        e.acc = Math.max(e.acc, (t.keys ?? []).filter(x => x.showAcc).length)
        if (t.dots) e.dot = true
        // 2도 화음은 음표머리가 옆으로 비켜 두 개 폭
        const ds = (t.keys ?? []).filter(x => x.step !== undefined).map(x => x.octave! * 7 + x.step!)
        if (ds.some((d, i) => i > 0 && d - ds[i - 1] === 1)) e.second = true
        starts.set(k, e)
      }
  const ss = [...starts.keys()].sort((a, b) => a - b)
  let w = 0
  ss.forEach((s, i) => {
    const d = (i + 1 < ss.length ? ss[i + 1] : bpb) - s
    const e = starts.get(s)!
    w += s8 * spaceFor(d) + Math.min(2, e.acc) * 9 + (e.dot ? 5 : 0) + (e.second ? 9 : 0)
  })
  return w
}
const OPEN_RUN = 4 // 오픈 하이햇이 이만큼 이어지면 음표마다 'o' 대신 'Open H.H' 글자로 (인쇄 악보처럼)

function keyName(k: number): string {
  return k >= 0 ? SHARP_KEYS[Math.min(7, k)] : FLAT_KEYS[Math.min(7, -k)]
}

function addHeader(s: Stave, clef: EStaff['clef'], eng: Engraved, withTime: boolean) {
  if (clef === 'treble8') s.addClef('treble', 'default', '8vb')
  else s.addClef(clef)
  if (eng.keySig) s.addKeySignature(keyName(eng.keySig))
  if (withTime) s.addTimeSignature(`${eng.beatsPerBar}/4`)
}

function headerWidth(VF: VF, eng: Engraved, clefs: EStaff['clef'][], withTime: boolean): number {
  let w = 0
  for (const c of clefs) {
    const s = new VF.Stave(0, 0, 500)
    addHeader(s, c, eng, withTime)
    s.format()
    w = Math.max(w, s.getNoteStartX())
  }
  return w
}

type HatLabel = 'start' | 'in' | 'close'

/** 드럼 손 성부의 하이햇: 길게 이어지는 오픈 구간은 글자로, 짧은 오픈만 'o' */
function hiHatMarks(eng: Engraved): { open: Set<ETick>; label: Map<ETick, HatLabel> } {
  const open = new Set<ETick>()
  const label = new Map<ETick, HatLabel>()
  if (eng.type !== 'drums') return { open, label }
  const seq: { t: ETick; open: boolean }[] = []
  for (const mm of eng.measures)
    for (const v of mm.staves[0].voices)
      for (const t of v.ticks) {
        if (t.kind !== 'note' || t.onset === undefined) continue
        const o = t.keys!.some(k => k.inst === 'hihat-open')
        if (o || t.keys!.some(k => k.inst === 'hihat')) seq.push({ t, open: o })
      }
  let longBefore = false
  for (let i = 0; i < seq.length; ) {
    let j = i
    while (j < seq.length && seq[j].open === seq[i].open) j++
    if (seq[i].open) {
      if (j - i >= OPEN_RUN) {
        label.set(seq[i].t, 'start')
        for (let k = i + 1; k < j; k++) label.set(seq[k].t, 'in')
        longBefore = true
      } else for (let k = i; k < j; k++) open.add(seq[k].t)
    } else if (longBefore) {
      label.set(seq[i].t, 'close')
      longBefore = false
    }
    i = j
  }
  return { open, label }
}

/** 마디 안 박(0 ~ bpb) → x */
export function xAt(mg: MeasureGeo, b: number): number {
  const p = mg.pts
  if (b <= p[0][0]) return p[0][1]
  for (let i = 1; i < p.length; i++) {
    if (b <= p[i][0]) {
      const [b0, x0] = p[i - 1]
      const [b1, x1] = p[i]
      return b1 - b0 < 1e-9 ? x1 : x0 + ((b - b0) / (b1 - b0)) * (x1 - x0)
    }
  }
  return p[p.length - 1][1]
}

/** 곡 전체 박(1마디 1박 = 0) → 그려진 자리. 아직 안 그린 마디면 null */
export function locate(lay: Layout, beat: number): { mg: MeasureGeo; row: RowGeo; x: number } | null {
  const m = Math.floor(beat / lay.bpb + 1e-9) + 1
  const mg = lay.measures.get(m)
  if (!mg) return null
  return { mg, row: lay.rows[mg.row], x: xAt(mg, beat - (m - 1) * lay.bpb) }
}

/** 그 박 근처에서 1박이 몇 단위인지 (ms → x 바꿀 때) */
export function unitsPerBeat(mg: MeasureGeo, b: number, bpb: number): number {
  const lo = Math.max(0, b - 0.5)
  const hi = Math.min(bpb, b + 0.5)
  return hi - lo > 1e-6 ? (xAt(mg, hi) - xAt(mg, lo)) / (hi - lo) : 40
}

/**
 * 악보를 줄 단위로 조금씩 그린다 (step 이 시간 예산만큼 그리고 돌아옴) — 85마디를 한 번에 그리면 폰에서 1초가 넘게 멈춰서.
 * 위에서부터 차례로 그리므로 이미 그린 줄은 움직이지 않는다. layout 은 그릴 때마다 채워진다.
 */
export class ScoreRenderer {
  readonly layout: Layout
  private readonly host: HTMLElement
  done = false
  private readonly VF: VF
  private readonly ctx: VexNS.SVGContext
  private readonly eng: Engraved
  private readonly score: PartScore
  private readonly byIdx: Map<number, Onset>
  private readonly cssWidth: number
  private readonly W: number
  private readonly grand: boolean
  private readonly heads: [number, number] // 첫 줄(박자표 포함) / 나머지 줄 머리 폭
  private readonly leftM: number
  private readonly avail: number
  private readonly maxPer: number
  private readonly hats: ReturnType<typeof hiHatMarks>
  private readonly mbs: (MeasureB | undefined)[] = []
  private next = 0 // 다음에 그릴 마디 (eng.measures 번호)
  private y = 0
  private slurPrev = new Map<string, StaveNote | null>()
  private slurTied = new Map<string, boolean>()
  private tieCarry = new Map<string, { note: StaveNote | null; idx: number[] }>() // note: null = 앞 줄(또는 범위 밖)에서 이어짐

  /** lead: 그리는 범위 바로 앞 마디 (붙임줄이 이어져 들어오는지 보려고만) */
  constructor(VF: VF, host: HTMLElement, eng: Engraved, score: PartScore, onsets: Onset[], cssWidth: number, lead?: Engraved['measures'][number]) {
    this.VF = VF
    lead?.staves.forEach((st, si) =>
      st.voices.forEach((v, vi) => {
        const t = v.ticks[v.ticks.length - 1]
        if (t?.kind === 'note' && t.tieToNext) this.tieCarry.set(`${si}/${vi}`, { note: null, idx: t.keys!.map((_, q) => q) })
      }),
    )
    this.eng = eng
    this.score = score
    this.byIdx = new Map(onsets.map(o => [o.idx, o]))
    this.cssWidth = cssWidth
    const scale = scaleFor(cssWidth)
    this.W = cssWidth / scale
    this.grand = eng.measures[0]?.staves.length === 2
    const clefs = eng.measures[0]?.staves.map(s => s.clef) ?? ['treble']
    this.leftM = this.grand ? 14 : 3 // 큰보표는 왼쪽에 괄호 자리
    this.avail = this.W - this.leftM - 3
    this.heads = [headerWidth(VF, eng, clefs, true), headerWidth(VF, eng, clefs, false)]
    this.maxPer = cssWidth < 600 ? 3 : cssWidth < 1000 ? 4 : 6
    this.hats = hiHatMarks(eng)
    // 그리기는 화면 밖 SVG 에 하고, 줄마다 따로 <svg> 로 옮겨 붙인다 — 한 SVG 에 계속 붙이면
    // 줄이 늘 때마다 브라우저가 이미 그린 줄까지 다시 배치해서 긴 곡은 점점 느려진다
    this.ctx = new VF.SVGContext(document.createElement('div'))
    this.host = host
    this.layout = { scale, width: this.W, height: 0, bpb: eng.beatsPerBar, rows: [], measures: new Map(), onsets: new Map(), ms: 0 }
    // 앞서 그린 악보는 새 첫 줄이 준비될 때 바꾼다 (그 사이 빈 화면·높이 출렁임 없이)
    if (!eng.measures.length) {
      this.done = true
      host.replaceChildren()
      this.resize()
    }
  }

  /** budget(ms) 동안 줄을 그린다. 다 그렸으면 true */
  step(budget: number): boolean {
    const t0 = performance.now()
    while (!this.done) {
      this.drawRow()
      if (performance.now() - t0 > budget) break
    }
    this.layout.ms += performance.now() - t0
    this.resize()
    return this.done
  }

  private resize() {
    this.host.style.height = `${Math.max(1, this.layout.height) * this.layout.scale}px`
  }

  private measure(i: number): MeasureB {
    let mb = this.mbs[i]
    if (!mb) {
      mb = buildMeasure(this.VF, this.eng.measures[i], this.eng, this.hats.open)
      this.mbs[i] = mb
    }
    return mb
  }

  private target(i: number): number {
    const s8 = 24
    return Math.max(MIN_MW, this.measure(i).minW * DENS + MPAD, idealWidth(this.eng.measures[i], this.eng.beatsPerBar, s8) + MPAD)
  }

  private drawRow() {
    const { VF, ctx, eng } = this
    const bpb = eng.beatsPerBar
    const ri = this.layout.rows.length
    const first = ri === 0
    const head = this.heads[first ? 0 : 1]
    const room = this.avail - head
    // 줄에 들어갈 마디 (최소 하나)
    const idxs: number[] = []
    let sum = 0
    for (let i = this.next; i < eng.measures.length && idxs.length < this.maxPer; i++) {
      const t = this.target(i)
      if (idxs.length && sum + t > room) break
      idxs.push(i)
      sum += t
    }
    this.next = idxs[idxs.length - 1] + 1
    const last = this.next >= eng.measures.length
    let k = room / sum
    if (last && k > 1.5) k = Math.min(k, 1.12) // 마지막 줄이 짧으면 억지로 늘리지 않는다
    // 한 마디도 다 안 들어가는 좁은 화면: 최소 폭까지만 줄인다 (그보다 좁히면 음표가 겹치니 그땐 조금 넘친다)
    if (k < 1) k = Math.max(k, (this.measure(idxs[0]).minW + 20) / sum)
    const g = ctx.openGroup('row') as SVGGElement

    // 큰보표 사이 간격: 윗오선 아래로 / 아랫오선 위로 튀어나가는 음 만큼
    let gap = 0
    if (this.grand) {
      let below = 0
      let above = 0
      for (const i of idxs) {
        const [tr, bs] = this.measure(i).staves
        for (const v of tr.voices)
          for (const n of v.notes) {
            if (n.isRest()) continue
            const kp = n.getKeyProps()
            below = Math.max(below, (1 - kp[0].line) * 10 + 6 + (n.getStemDirection() === -1 ? 30 : 0))
          }
        for (const v of bs.voices)
          for (const n of v.notes) {
            if (n.isRest()) continue
            const kp = n.getKeyProps()
            above = Math.max(above, (kp[kp.length - 1].line - 5) * 10 + 6 + (n.getStemDirection() === 1 ? 30 : 0))
          }
      }
      gap = Math.max(84, 40 + below + above + 12)
    }

    let x = this.leftM
    const placed: { mb: MeasureB; sts: Stave[] }[] = []
    idxs.forEach((i, ci) => {
      const mb = this.measure(i)
      const w = this.target(i) * k + (ci === 0 ? head : 0)
      const sts = mb.staves.map((sb, si) => {
        const s = new VF.Stave(x, si * gap, w, { spaceAboveStaffLn: 0, spaceBelowStaffLn: 0 })
        if (ci === 0) addHeader(s, sb.clef, eng, first)
        else s.setBegBarType(VF.BarlineType.NONE)
        if (ci === 0 && !this.grand) s.setBegBarType(VF.BarlineType.NONE) // 한 오선이면 줄 첫 세로줄 없이 (인쇄 악보처럼)
        s.setContext(ctx)
        return s
      })
      if (sts.length > 1) {
        sts.forEach(s => s.format())
        const nx = Math.max(...sts.map(s => s.getNoteStartX()))
        sts.forEach(s => s.setNoteStartX(nx))
      }
      sts.forEach(s => s.draw())
      if (this.grand) {
        if (ci === 0) {
          new VF.StaveConnector(sts[0], sts[1]).setType('brace').setContext(ctx).draw()
          new VF.StaveConnector(sts[0], sts[1]).setType('singleLeft').setContext(ctx).draw()
        }
        new VF.StaveConnector(sts[0], sts[1]).setType('singleRight').setContext(ctx).draw()
      }
      mb.staves.forEach((sb, si) => sb.voices.forEach(v => v.voice.setStave(sts[si])))
      const all = mb.staves.flatMap(sb => sb.voices.map(v => v.voice))
      mb.formatter.format(all, sts[0].getNoteEndX() - sts[0].getNoteStartX() - 10)
      // 두 성부 쉼표가 겹치면 VexFlow 는 아래 것을 숨기는데, 인쇄 악보처럼 둘 다 보이게 (자리는 위·아래로 이미 비켜 있다)
      for (const sb of mb.staves) for (const v of sb.voices) for (const n of v.notes) if (n.isRest()) n.renderOptions.draw = true
      mb.staves.forEach((sb, si) => sb.voices.forEach(v => v.voice.draw(ctx, sts[si])))
      for (const b of mb.beams) b.setContext(ctx).draw()
      for (const t of mb.tuplets) t.setContext(ctx).draw()
      this.drawTies(mb, ci === 0)
      this.drawSlurs(mb, ci === 0)
      placed.push({ mb, sts })
      x += w
    })
    this.closeTies()

    // 이 줄의 실제 위·아래 (음표·기둥·들보·잇단 숫자 포함)
    // 오선·음자리표 (높은음자리표는 위아래로 1.5칸, 기타의 8 은 아래로 더)
    let top = -16
    let bottom = gap + 40 + (eng.measures[0]?.staves[0].clef === 'treble8' && !this.grand ? 26 : 16)
    const noteTop = new Map<StaveNote, number>()
    for (const { mb } of placed) {
      for (const sb of mb.staves)
        for (const v of sb.voices)
          for (const n of v.notes) {
            const bb = n.getBoundingBox()
            let t = bb.getY()
            let b = bb.getY() + bb.getH()
            if (!n.isRest() && n.hasStem()) {
              const ext = n.getStemExtents()
              t = Math.min(t, ext.topY, ext.baseY)
              b = Math.max(b, ext.topY, ext.baseY)
            }
            noteTop.set(n, t)
            top = Math.min(top, t - 4)
            bottom = Math.max(bottom, b + 4)
          }
      for (const t of mb.tuplets) {
        const ty = t.getYPosition()
        top = Math.min(top, ty - 14)
        bottom = Math.max(bottom, ty + 6)
      }
    }
    // 하이햇 열고 닫기 글자, 마디 번호
    ctx.save()
    ctx.setFont('Arial, sans-serif', 10, 'normal', 'italic')
    let rowOpen = false
    for (const { mb } of placed)
      for (const sb of mb.staves)
        for (const v of sb.voices)
          v.ticks.forEach((t, ti) => {
            const lab = this.hats.label.get(t)
            if (!lab || (lab === 'in' && rowOpen)) return
            rowOpen = lab !== 'close'
            const n = v.notes[ti]
            const ty = Math.min(-6, noteTop.get(n) ?? 0) - 5
            ctx.fillText(lab === 'start' ? 'Open H.H' : lab === 'in' ? '(Open H.H)' : 'Closed H.H', n.getAbsoluteX() - 2, ty)
            top = Math.min(top, ty - 12)
          })
    ctx.setFont('Arial, sans-serif', 10, 'normal', 'normal')
    ctx.setFillStyle('#a1a1aa')
    for (const { mb, sts } of placed) {
      const s = sts[0]
      // 마디 첫머리 근처 음표가 높이 올라가 있으면 그 위로 (붙임줄 곡선이 음표 위로 지나가는 만큼 더 띄운다)
      let ny = -6
      for (const sb of mb.staves.slice(0, 1))
        for (const v of sb.voices)
          v.notes.forEach((n, ti) => {
            if (n.getAbsoluteX() > s.getNoteStartX() + 22) return
            const t = noteTop.get(n) ?? 0
            if (t < -2) ny = Math.min(ny, t - (v.ticks[ti].kind === 'note' ? 9 : 4))
          })
      const nx = s.getX() + (s === placed[0].sts[0] ? 0 : 2)
      ctx.fillText(String(mb.m), nx, ny)
      top = Math.min(top, ny - 10)
    }
    ctx.restore()
    ctx.closeGroup()

    // 이 줄만의 <svg>: 줄 맨 위(top)가 0 이 되게 옮겨서 화면 px 크기로
    const dy = this.y - top
    const { scale } = this.layout
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    // VexFlow 는 바탕 <svg> 에 둔 기본값(글꼴·선 굵기·색)과 같은 속성은 안 적으므로 그대로 옮겨 준다
    for (const a of Array.from(this.ctx.svg.attributes)) svg.setAttribute(a.name, a.value)
    svg.setAttribute('width', String(this.cssWidth))
    svg.setAttribute('height', String((bottom - top) * scale))
    svg.setAttribute('style', `position:absolute;left:0;top:${this.y * scale}px;overflow:visible`)
    g.setAttribute('transform', `scale(${scale}) translate(0 ${-top})`)
    svg.appendChild(g)
    if (ri === 0) this.host.replaceChildren()
    this.host.appendChild(svg)
    const row: RowGeo = { top: this.y, bottom: this.y + (bottom - top), staffTop: dy, staffBottom: dy + gap + 40, ms: placed.map(p => p.mb.m) }
    this.layout.rows.push(row)
    this.y += bottom - top + (this.cssWidth < 600 ? 4 : 10)
    this.layout.height = this.y
    this.collectGeo(placed, ri, dy)
    if (last) this.done = true
  }

  // 붙임줄 (마디 안 + 앞 마디에서 이어지는 것, 줄이 바뀌면 반쪽씩)
  // 기타 벤딩·해머링처럼 새로 치지 않는 음(slur): 앞 음에서 이음줄 (줄이 바뀌면 줄 머리부터)
  private drawSlurs(mb: MeasureB, rowStart: boolean) {
    if (this.eng.type === 'drums') return
    const { VF, ctx } = this
    mb.staves.forEach((sb, si) =>
      sb.voices.forEach((v, vi) => {
        const key = `${si}/${vi}`
        let prev = rowStart ? null : (this.slurPrev.get(key) ?? null)
        let prevTied = this.slurTied.get(key) ?? false
        v.ticks.forEach((t, ti) => {
          const n = v.notes[ti]
          if (t.kind !== 'note') {
            prev = null
            prevTied = false
            return
          }
          if (!prevTied && t.keys!.every(k => k.slur)) new VF.Curve(prev ?? undefined, n, {}).setContext(ctx).draw()
          prev = n
          prevTied = !!t.tieToNext
        })
        this.slurPrev.set(key, prev)
        this.slurTied.set(key, prevTied)
      }),
    )
  }

  /** 줄 끝: 다음 줄로 넘어가는 붙임줄의 앞 반쪽을 이 줄에 그린다 */
  private closeTies() {
    for (const c of this.tieCarry.values()) {
      if (!c.note) continue
      new this.VF.StaveTie({ firstNote: c.note, firstIndexes: c.idx, lastIndexes: c.idx }).setContext(this.ctx).draw()
      c.note = null
    }
  }

  private drawTies(mb: MeasureB, rowStart: boolean) {
    const { VF, ctx } = this
    mb.staves.forEach((sb, si) =>
      sb.voices.forEach((v, vi) => {
        const key = `${si}/${vi}`
        const carry = this.tieCarry.get(key)
        this.tieCarry.delete(key)
        v.ticks.forEach((t, ti) => {
          const n = v.notes[ti]
          if (ti === 0 && carry && t.kind === 'note') {
            const ix = { firstIndexes: carry.idx, lastIndexes: carry.idx }
            if (rowStart || !carry.note) new VF.StaveTie({ lastNote: n, ...ix }).setContext(ctx).draw()
            else new VF.StaveTie({ firstNote: carry.note, lastNote: n, ...ix }).setContext(ctx).draw()
          }
          if (t.kind !== 'note' || !t.tieToNext) return
          const idx = t.keys!.map((_, q) => q)
          const nx = v.notes[ti + 1]
          if (nx) new VF.StaveTie({ firstNote: n, lastNote: nx, firstIndexes: idx, lastIndexes: idx }).setContext(ctx).draw()
          else this.tieCarry.set(key, { note: n, idx })
        })
      }),
    )
  }

  // 진행선(박 → x)·내 타격 표시(음표머리 자리) 좌표
  private collectGeo(placed: { mb: MeasureB; sts: Stave[] }[], ri: number, dy: number) {
    const { score, eng } = this
    const bpb = eng.beatsPerBar
    const geos: MeasureGeo[] = placed.map(({ mb, sts }) => {
      // 같은 박이면 음표 머리 가운데 (여러 성부면 왼쪽 것), 음표가 없으면 쉼표 가운데
      const byStart = new Map<number, { notes: number[]; rests: number[] }>()
      for (const sb of mb.staves)
        for (const v of sb.voices)
          v.ticks.forEach((t, ti) => {
            if (t.measureRest) return
            const n = v.notes[ti]
            const s = Math.round(t.start * 1e4) / 1e4
            let e = byStart.get(s)
            if (!e) byStart.set(s, (e = { notes: [], rests: [] }))
            ;(t.kind === 'note' ? e.notes : e.rests).push(n.getAbsoluteX() + n.getGlyphWidth() / 2)
          })
      const pts: [number, number][] = [...byStart.entries()]
        .map(([s, e]): [number, number] => [s, Math.min(...(e.notes.length ? e.notes : e.rests))])
        .sort((a, b) => a[0] - b[0])
      if (!pts.length || pts[0][0] > 0) pts.unshift([0, sts[0].getNoteStartX() + 6])
      return { m: mb.m, row: ri, x0: sts[0].getX(), x1: sts[0].getX() + sts[0].getWidth(), pts }
    })
    // 마디 끝 = 다음 마디 첫 음 자리 (같은 줄이면 이어지게), 줄 끝이면 마디선 조금 앞
    geos.forEach((mg, ci) => {
      const nx = geos[ci + 1]
      let endX = nx ? nx.pts[0][1] : mg.x1 - 4
      // 온쉼표 마디 등 첫 점이 끝보다 오른쪽이면 끝을 마디선 앞으로
      if (endX <= mg.pts[mg.pts.length - 1][1]) endX = Math.max(mg.pts[mg.pts.length - 1][1] + 1, mg.x1 - 4)
      mg.pts.push([bpb, endX])
      this.layout.measures.set(mg.m, mg)
    })
    // 타격 idx → 그 순간의 음표머리들 (여러 성부·오선에 걸쳐도 다 모은다)
    for (const { mb } of placed) {
      const anchors: { idx: number; start: number }[] = []
      for (const sb of mb.staves)
        for (const v of sb.voices)
          for (const t of v.ticks) {
            if (t.onset !== undefined) anchors.push({ idx: t.onset, start: t.start })
            for (const o of t.moreOnsets ?? []) anchors.push({ idx: o, start: t.start })
          }
      for (const { idx, start } of anchors) {
        const o = this.byIdx.get(idx)
        if (!o) continue
        const evs = new Set(o.notes)
        const heads: Head[] = []
        for (const sb of mb.staves)
          for (const v of sb.voices)
            v.ticks.forEach((t, q) => {
              if (t.kind !== 'note' || Math.abs(t.start - start) > 1e-6) return
              if (!(t.events ?? []).some(e => evs.has(e))) return
              const nhs = v.notes[q].noteHeads
              t.keys!.forEach((k, ki) => {
                const ok = score.type === 'drums' ? o.labels.includes(k.inst!) : o.notes.some(e => score.events[e].p === k.p)
                const nh = nhs[ki] as unknown as NoteHeadLike | undefined
                if (!ok || !nh) return
                heads.push({ x: nh.x + nh.xShift, y: nh.y + nh.yShift + dy, w: nh.getWidth(), glyph: nh.getText(), size: String(nh.fontInfo.size) })
              })
            })
        if (!heads.length) continue
        this.layout.onsets.set(idx, {
          idx,
          row: ri,
          x: Math.min(...heads.map(h => h.x + h.w / 2)),
          top: Math.min(...heads.map(h => h.y)) - 7,
          bottom: Math.max(...heads.map(h => h.y)) + 7,
          heads,
        })
      }
    }
  }
}

interface NoteHeadLike {
  x: number
  y: number
  xShift: number
  yShift: number
  getWidth(): number
  getText(): string
  fontInfo: { size: string | number }
}

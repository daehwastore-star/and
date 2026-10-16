// 악보 데이터(score.ts 의 PartScore: 시작 박·길이만 있는 음 목록) → 실제 악보로 그릴 수 있는 모양.
// 마디마다 성부(voice)별로 음표·쉼표를 빈틈없이 채우고, 길이를 표준 음표(온·2분·4분·8분·16분·32분, 점, 잇단음표)로 바꾼다.
// 그리는 쪽(VexFlow)은 여기 결과만 보고 그린다 — 박자 계산은 전부 여기서.
//
// ※ 계약(타입)은 그리는 쪽과 같이 쓰므로 바꿀 때 둘 다 맞출 것.

import { DRUM_DOWN, DRUM_POS, keyAlterations, onsetsOf, spell, type PartScore } from './score'

/** 표준 음표 길이 (VexFlow duration 문자열과 같다) */
export type Dur = 'w' | 'h' | 'q' | '8' | '16' | '32' | '64'

/** 한 음표(화음)의 음 하나 */
export interface EKey {
  /** 드럼: 악기 이름 (kick, snare, hihat, hihat-open, ride, crash, tom1, tom2, floor, rim, hihat-foot) */
  inst?: string
  /** 음높이 악보: 적힌 음 (기타 treble8 은 한 옥타브 위로 적은 음). step 0=C … 6=B */
  step?: number
  octave?: number
  /** 실제 올림·내림 (-2 ~ 2) */
  alter?: number
  /** 임시표를 그려야 하는지 (조표·같은 마디 앞 음 반영). 그릴 때 alter 로 ♯/♭/♮ 고른다 */
  showAcc?: boolean
  /** 원래 MIDI (실제 소리) */
  p?: number
  /** 기타 벤딩·해머링처럼 새로 안 치는 음 */
  slur?: boolean
}

/** 잇단음표 정보 (예: 셋잇단 8분 = { id, num: 3, inSpaceOf: 2 }) */
export interface ETupletRef {
  /** 같은 성부·같은 마디 안에서 같은 묶음이면 같은 id */
  id: number
  num: number
  inSpaceOf: number
}

export interface ETick {
  kind: 'note' | 'rest'
  /** 마디 안 시작 박 (0 ≤ start < beatsPerBar), 4분음표 = 1 */
  start: number
  /** 실제 길이 (박). 잇단음표면 줄어든 길이 (셋잇단 8분 = 1/3) */
  len: number
  dur: Dur
  dots: 0 | 1 | 2
  tuplet?: ETupletRef
  /** note 일 때: 아래 → 위 순서 */
  keys?: EKey[]
  /**
   * 이 음표에서 새로 치면 onsetsOf() 의 idx (붙임줄로 이어진 뒤쪽 조각·slur 만 있는 음표는 없음).
   * 한 idx 는 음표 하나에만 붙는다 — 여러 성부·오선에 걸치면(하이햇+킥, 양손 화음) 손(up)·높은음자리 쪽 음표에
   */
  onset?: number
  /** 다음 tick(마디를 넘어가도)과 붙임줄로 이어짐 */
  tieToNext?: boolean
  /** 드럼 롤 (트레몰로 빗금) */
  roll?: boolean
  /** 원본 이벤트 번호 (score.events 인덱스) — 디버그·검증용 */
  events?: number[]
  /**
   * (추가) 같은 화음에 같이 붙는 onsetsOf() idx 나머지.
   * onsetsOf() 는 첫 음에서 0.06박 안만 한 번으로 묶어서, 줄 사이가 넓게 벌어진 기타 스트로크를 두세 개로 쪼갠다.
   * 악보엔 한 화음으로 그리므로 onset 과 함께 이것들도 이 음표에 표시하면 된다 (onset 이 가장 이른 것)
   */
  moreOnsets?: number[]
  /** (추가) 마디 전체 쉼표 — 박자와 상관없이 온쉼표 모양으로 마디 가운데에. 4/4 가 아니면 len(=beatsPerBar)이 dur 'w' 와 다르다 */
  measureRest?: boolean
}

export interface EVoice {
  /** 기둥 방향: 드럼 손 = up, 발 = down. 음높이 악보 한 성부면 auto */
  stem: 'up' | 'down' | 'auto'
  /** start 순서대로, 마디를 빈틈없이 채운다 (len 합 = beatsPerBar) */
  ticks: ETick[]
}

export interface EStaff {
  clef: 'percussion' | 'treble' | 'treble8' | 'bass'
  /** 드럼은 [손(up), 발(down)]. 단 마디가 통째로 비면 온쉼표 하나짜리 성부 1개 (stem auto) — 쉼표가 두 개 겹쳐 보이지 않게 */
  voices: EVoice[]
}

export interface EMeasure {
  /** 마디 번호 (1부터) */
  m: number
  /** 드럼·기타: 1개, 키보드(큰보표): [오른손 높은음자리, 왼손 낮은음자리] */
  staves: EStaff[]
}

export interface Engraved {
  type: PartScore['type']
  /** 조표 (♯ 개수, ♭ 이면 음수). 드럼 0 */
  keySig: number
  beatsPerBar: number
  measures: EMeasure[]
}

export interface EngraveOptions {
  beatsPerBar: number
  /** 그릴 마디 범위 (포함) */
  fromBar: number
  toBar: number
  /**
   * (추가) 드럼: 다음 타격이 2박 이상 멀면 2분음표로 (1·3박에서만). 기본 false = 인쇄된 드럼 악보처럼
   * 4분음표 + 쉼표로 적는다 (예: 크래시 1박 → 4분음표, 4분쉼표, 2분쉼표)
   */
  drumHalfNotes?: boolean
}

// ───────────────────────── 구현 ─────────────────────────
// 1) 성부 나누기: 드럼 손(up)/발(down), 큰보표 오른손/왼손, 기타·베이스는 하나.
// 2) 성부마다 같은 순간 음을 화음으로 묶고(벌어진 스트로크 포함), 박마다 가장 단순한 격자(4분·8분·16분·셋잇단·6잇단·32분,
//    필요하면 반 박씩 따로)를 골라 시작을 맞춘다. 음높이 악보는 끝(= 쉼표 시작)도 맞춘다.
// 3) 마디마다 음표 구간·쉼표 구간으로 나누고, 박 구조에 맞는 음표 값으로 쪼갠다 (음표는 붙임줄, 쉼표는 따로).
// 박을 24 단위로 쪼개 정수로 계산한다 (32분 = 3, 16분 = 6, 셋잇단 8분 = 8, 6잇단 16분 = 4) — 소수 오차 없이 마디를 꽉 채우려고.

const U = 24
/** 한 박 안 격자 후보 (단위). 단순한 것부터: 4분, 8분, 16분, 셋잇단 8분, 6잇단 16분, 32분 */
const GRIDS = [24, 12, 6, 8, 4, 3]
/** 새로 치는 음의 시작은 이 안에서 격자에 맞아야 한다 (박). 32분(0.125)과 6잇단(0.167)이 0.042 차이라 그 절반 */
const TOL_HARD = 0.02
/** slur 음·음 끝(쉼표 시작)은 느슨하게 맞춘다 (16분 격자면 어디든 들어온다) */
const TOL_SOFT = 0.13
/** 음 끝과 다음 음 사이가 이보다 짧으면 이어 붙인다 (뮤트·스타카토로 살짝 짧게 적힌 음 뒤에 32분쉼표가 생기지 않게) */
const LEGATO_GAP = 0.24
/** 박 경계에서 이만큼 안쪽이면 박 위로 본다 */
const EDGE = 0.03

const DUR: Record<number, [Dur, 0 | 1]> = {
  3: ['32', 0],
  6: ['16', 0],
  9: ['16', 1],
  12: ['8', 0],
  18: ['8', 1],
  24: ['q', 0],
  36: ['q', 1],
  48: ['h', 0],
  72: ['h', 1],
  96: ['w', 0],
  144: ['w', 1],
}

interface Item {
  i: number // score.events 번호
  b: number
  end: number
  hard: boolean // 새로 치는 음 (slur 아님)
  keys: EKey[]
  roll?: boolean
}

interface Chord {
  raw: number // 원래 시작 박 (묶음 첫 음)
  items: Item[]
  maxEnd: number
  hard: boolean
  restAt: number | null // 이 화음 뒤로 쉼표가 시작하는 박 (다음 화음까지 이어지면 null)
  s: number // 정리된 시작 (단위, 곡 처음 = 0)
  e: number // 정리된 끝 (음높이 악보만)
  onsets: number[] // 이 화음에 표시할 onsetsOf idx
  keys: EKey[]
  evs: number[]
  roll: boolean
}

// 박 하나가 어떻게 쪼개지는지: 보통 / 셋잇단 8분 / 6잇단(박 전체 6:4) / 반 박씩 (앞·뒤 반 박마다 16분 셋잇단 3:2 인지)
type Kind = { t: 'bin' } | { t: 'tri' } | { t: 'six' } | { t: 'half'; tup: [boolean, boolean] }
const BIN: Kind = { t: 'bin' }
const TRI: Kind = { t: 'tri' }
const SIX: Kind = { t: 'six' }

/** 넓게 벌어진 스트로크도 이 폭(박)까진 한 화음 (6줄 × 0.05박 = 0.25 가 실제 데이터 최대) */
const STRUM_SPAN = 0.3

/**
 * 같은 순간 음 묶기 — onsetsOf 와 같은 허용치지만 '바로 앞 음' 기준으로 이어 묶어서 넓게 벌어진 스트로크도 한 화음으로.
 * 대신 STRUM_SPAN 을 넘거나 마디선을 넘어서까지 잇지는 않는다
 */
function cluster(items: Item[], tol: number, bpb: number): Chord[] {
  items.sort((a, b) => a.b - b.b || a.i - b.i)
  const bar = (b: number) => Math.floor(Math.floor(b + EDGE) / bpb)
  const out: Chord[] = []
  let last = -Infinity
  for (const it of items) {
    const cur = out[out.length - 1]
    if (cur && it.b - last < tol && it.b - cur.raw < STRUM_SPAN && bar(it.b) === bar(cur.raw)) {
      cur.items.push(it)
      cur.maxEnd = Math.max(cur.maxEnd, it.end)
      if (it.hard) cur.hard = true
    } else {
      out.push({ raw: it.b, items: [it], maxEnd: it.end, hard: it.hard, restAt: null, s: 0, e: 0, onsets: [], keys: [], evs: [], roll: false })
    }
    last = it.b
  }
  return out
}

/** 박 하나의 격자: 박 전체에 하나, 또는 [앞 반 박, 뒤 반 박] 따로 (16분 셋잇단 + 보통 16분이 한 박에 섞일 때) */
type Grid = number | [number, number]

/** 박 안 위치(박) → 격자 칸 (단위). start 면 박(반 박) 안에 머물게, 쉼표 시작이면 끝 경계까지 허용 */
function snap(pos: number, g: Grid, start: boolean): number {
  if (typeof g === 'number') {
    const q = Math.round((pos * U) / g) * g
    return start ? Math.min(U - g, Math.max(0, q)) : Math.max(0, Math.min(U, q))
  }
  const h = pos < 0.5 - EDGE ? 0 : 1
  const gh = g[h]
  const q = Math.round(((pos - h / 2) * U) / gh) * gh
  return h * 12 + (start ? Math.min(12 - gh, Math.max(0, q)) : Math.max(0, Math.min(12, q)))
}

/** 그 자리의 격자 한 칸 */
function unitAt(g: Grid, pos: number): number {
  return typeof g === 'number' ? g : g[pos < 0.5 - EDGE ? 0 : 1]
}

/** 아주 짧은 음의 최소 길이: 보통 격자면 16분(더 고운 격자면 그 칸), 잇단 격자면 그 칸 */
function minLen(g: number): number {
  return g === 8 || g === 4 ? g : Math.min(g, 6)
}

/** 6잇단 자리엔 맞고 32분 자리엔 안 맞는 시작이 있어야만 잇단 격자를 쓴다 (slur·쉼표 때문에 잇단음표가 생기지 않게) */
function offBy(pos: number, g: number): number {
  return Math.abs(pos - (Math.round((pos * U) / g) * g) / U)
}

interface BeatPts {
  st: { pos: number; hard: boolean }[]
  rs: { pos: number; sp: number | null }[] // 쉼표 시작 (sp: 같은 박에서 시작한 그 음의 위치)
}

/** 격자 g 로 박(또는 반 박)의 점들을 맞췄을 때: 허용치 안인지, 비용 */
function tryGrid(p: BeatPts, g: Grid): { ok: boolean; cost: number; clash: boolean } {
  let hardErr = 0
  let softErr = 0
  let restErr = 0
  const seen = new Set<number>()
  let clash = false
  for (const s of p.st) {
    const q = snap(s.pos, g, true)
    if (seen.has(q)) clash = true
    seen.add(q)
    const err = Math.abs(q / U - s.pos)
    if (s.hard) hardErr = Math.max(hardErr, err)
    else softErr = Math.max(softErr, err)
  }
  for (const r of p.rs) {
    let q = snap(r.pos, g, false)
    let err = Math.abs(q / U - r.pos)
    if (r.sp !== null) {
      const qs = snap(r.sp, g, true)
      if (q <= qs) {
        // 시작 칸으로 말려 들어가면 최소 길이로 늘린다 — 원래 그보다 짧은 음이면 오차로 치지 않는다
        const ml = minLen(unitAt(g, r.sp))
        q = qs + ml
        err = r.pos - r.sp <= ml / U ? 0 : Math.abs(q / U - r.pos)
      }
    }
    restErr = Math.max(restErr, err)
  }
  return {
    ok: !clash && hardErr <= TOL_HARD && softErr <= TOL_SOFT && restErr <= TOL_SOFT,
    cost: hardErr * 4 + softErr + restErr * 0.5,
    clash,
  }
}

/** 박 하나에 들어온 점들을 가장 단순하게 담는 격자 */
function fitGrid(p: BeatPts): Grid {
  const tup = p.st.some(s => offBy(s.pos, 3) > TOL_HARD && offBy(s.pos, 4) <= TOL_HARD)
  const cands = tup ? GRIDS : GRIDS.filter(g => g !== 8 && g !== 4)
  for (const g of cands) if (tryGrid(p, g).ok) return g
  // 박 전체로 안 되면 앞·뒤 반 박을 따로 (예: 16분 셋잇단 + 16분 둘)
  const halves = cands.filter(g => g <= 12 && g !== 8)
  const half = (h: number): number | null => {
    const inHalf = (pos: number) => (pos < 0.5 - EDGE ? 0 : 1) === h
    const sub: BeatPts = { st: p.st.filter(s => inHalf(s.pos)), rs: p.rs.filter(r => inHalf(r.pos)) }
    for (const g of halves) if (tryGrid(sub, h ? [3, g] : [g, 3]).ok) return g
    return null
  }
  const a = half(0)
  const b = half(1)
  if (a !== null && b !== null) return [a, b]
  // 딱 맞는 게 없으면 (사람이 친 MIDI 등) 오차가 가장 작은 것
  let best: Grid = 3
  let bestCost = Infinity
  cands.forEach((g, k) => {
    const r = tryGrid(p, g)
    if (!r.clash && r.cost + k * 0.001 < bestCost) {
      bestCost = r.cost + k * 0.001
      best = g
    }
  })
  return best
}

/** 박(곡 처음부터 몇 번째 박) → 격자 */
function pickGrids(chords: Chord[]): Map<number, Grid> {
  const pts = new Map<number, BeatPts>()
  const at = (beat: number) => {
    let p = pts.get(beat)
    if (!p) pts.set(beat, (p = { st: [], rs: [] }))
    return p
  }
  for (const c of chords) {
    const beat = Math.floor(c.raw + EDGE)
    at(beat).st.push({ pos: c.raw - beat, hard: c.hard })
    if (c.restAt !== null && Math.abs(c.restAt - Math.round(c.restAt)) > EDGE) {
      const rb = Math.floor(c.restAt)
      at(rb).rs.push({ pos: c.restAt - rb, sp: rb === beat ? c.raw - beat : null })
    }
  }
  const out = new Map<number, Grid>()
  for (const [beat, p] of pts) out.set(beat, fitGrid(p))
  return out
}

// 음 끝: 다음 화음까지(짧은 틈은 메움). 그 앞에서 끝나면 거기서 쉼표 시작
function setRestAt(chords: Chord[]) {
  for (let k = 0; k < chords.length; k++) {
    const c = chords[k]
    const nx = chords[k + 1]
    let end = c.maxEnd
    if (nx) {
      end = Math.min(end, nx.raw)
      // 짧은 틈, 또는 아주 짧은 음(뮤트 스트로크 등) 뒤 8분 안에 다음 음이 오면 거기까지 한 음으로
      if (nx.raw - end < LEGATO_GAP || (end - c.raw <= 0.15 && nx.raw - c.raw <= 0.5 + EDGE)) end = nx.raw
    }
    c.restAt = nx && end >= nx.raw - 1e-9 ? null : Math.max(end, c.raw + 1e-3)
  }
}

/** 한 성부: 화음으로 묶고 → 박마다 격자 골라 시작(·끝)을 맞춘다 */
function buildVoice(items: Item[], pitched: boolean, bpb: number): Chord[] {
  let chords = cluster(items, pitched ? 0.06 : 0.01, bpb)
  for (;;) {
    if (pitched) setRestAt(chords)
    const grids = pickGrids(chords)
    for (const c of chords) {
      const beat = Math.floor(c.raw + EDGE)
      c.s = beat * U + snap(c.raw - beat, grids.get(beat)!, true)
    }
    // 어떤 격자로도 같은 칸에 떨어지는 음(아주 촘촘한 꾸밈음 등)은 앞 화음에 합친다 → 격자를 다시 고른다
    const merged: Chord[] = []
    for (const c of chords) {
      const prev = merged[merged.length - 1]
      if (prev && c.s <= prev.s) {
        prev.items.push(...c.items)
        prev.maxEnd = Math.max(prev.maxEnd, c.maxEnd)
        if (c.hard) prev.hard = true
      } else merged.push(c)
    }
    const again = merged.length !== chords.length
    chords = merged
    if (again) continue
    if (pitched) {
      for (let k = 0; k < chords.length; k++) {
        const c = chords[k]
        const nx = chords[k + 1]
        if (c.restAt === null) {
          c.e = nx.s
          continue
        }
        const r = c.restAt
        let e: number
        if (Math.abs(r - Math.round(r)) <= EDGE) e = Math.round(r) * U
        else {
          const rb = Math.floor(r)
          e = rb * U + snap(r - rb, grids.get(rb) ?? 12, false)
        }
        if (e <= c.s) {
          const sb = Math.floor(c.s / U)
          e = c.s + minLen(unitAt(grids.get(sb) ?? U, (c.s - sb * U) / U))
        }
        if (nx && e > nx.s) e = nx.s
        c.e = e
      }
    }
    return chords
  }
}

function drumKeys(insts: string[]): EKey[] {
  return [...new Set(insts)].sort((a, b) => (DRUM_POS[b] ?? 0) - (DRUM_POS[a] ?? 0)).map(inst => ({ inst }))
}

/** 마디 안 박 묶음 [시작, 끝) (단위) — 4/4 는 1–2박, 3–4박. 이 경계를 약박에서 넘는 긴 음은 붙임줄로 나눈다 */
function groupBounds(bpb: number): [number, number][] {
  const sizes: number[] = []
  if (bpb <= 3) sizes.push(bpb)
  else if (bpb % 2 === 0 && bpb !== 6) for (let i = 0; i < bpb; i += 2) sizes.push(2)
  else if (bpb % 3 === 0) for (let i = 0; i < bpb; i += 3) sizes.push(3)
  else {
    for (let i = 0; i < bpb - 3; i += 2) sizes.push(2)
    sizes.push(3)
  }
  const out: [number, number][] = []
  let t = 0
  for (const n of sizes) {
    out.push([t * U, (t + n) * U])
    t += n
  }
  return out
}

/** 마디 안 경계점들로 박마다 쪼개짐 판단 */
function kindsOf(points: number[], bpb: number): Kind[] {
  const per: number[][] = Array.from({ length: bpb }, () => [])
  for (const p of points) {
    const j = Math.floor(p / U)
    const o = p - j * U
    if (o > 0 && j >= 0 && j < bpb && !per[j].includes(o)) per[j].push(o)
  }
  return per.map(os => {
    if (os.every(o => o % 3 === 0)) return BIN
    if (os.every(o => o % 8 === 0)) return TRI
    // 앞·뒤 반 박 모두 6잇단 자리가 있으면 박 전체를 6잇단(6:4) 하나로 (인쇄 악보처럼 '6').
    // 한쪽만이면 그 반 박만 16분 셋잇단(3:2), 나머지 반 박은 보통 음표 — 보통 16분·32분 자리가 섞여도 이렇게
    const t0 = os.some(o => o < 12 && o % 3 !== 0)
    const t1 = os.some(o => o > 12 && o % 3 !== 0)
    if (t0 && t1 && os.every(o => o % 4 === 0)) return SIX
    return { t: 'half', tup: [t0, t1] }
  })
}

function okBin(o: number, L: number): boolean {
  if (L === 18) return o === 0 || o === 6 // 점8분: 박 머리 또는 16분 뒤 (16 + 점8)
  if (L === 12) return o % 6 === 0 // 8분: 16분 자리 (16-8-16 도 허용)
  if (L === 9) return o % 12 === 0 || o % 12 === 3 // 점16분: 반 박 안에서만
  if (L === 6) return (o % 12) + 6 <= 12 // 16분: 반 박을 넘지 않게
  return L === 3
}

/** 박 안에서 o 부터 end 까지 한 번에 적을 수 있는 가장 긴 음표 (단위, 실제 길이) */
function subNote(k: Kind, o: number, end: number): number {
  if (k.t === 'bin') {
    for (const L of [18, 12, 9, 6, 3]) if (o + L <= end && okBin(o, L)) return L
  } else if (k.t === 'tri') {
    if ((o === 0 || o === 8) && o + 16 <= end) return 16
    if (o % 8 === 0 && o + 8 <= end) return 8
  } else if (k.t === 'six') {
    for (const L of [16, 12, 8, 4]) if (o % 4 === 0 && o + L <= end) return L
  } else {
    const h = o < 12 ? 0 : 12
    const lim = Math.min(end, h + 12)
    if (k.tup[h / 12]) {
      if ((o - h === 0 || o - h === 4) && o + 8 <= lim) return 8
      if (o % 4 === 0 && o + 4 <= lim) return 4
    } else return subNote(BIN, o, lim)
  }
  return end - o
}

/** 박 안 쉼표: 제 길이 자리에 맞춰 (점쉼표 없이) */
function subRest(k: Kind, o: number, end: number): number {
  if (k.t === 'bin') {
    for (const r of [12, 6, 3]) if (o % r === 0 && o + r <= end) return r
  } else if (k.t === 'tri') {
    if ((o === 0 || o === 8) && o + 16 <= end) return 16
    if (o % 8 === 0 && o + 8 <= end) return 8
  } else if (k.t === 'six') {
    if (o % 8 === 0 && o + 8 <= end) return 8
    if (o % 4 === 0 && o + 4 <= end) return 4
  } else {
    const h = o < 12 ? 0 : 12
    const lim = Math.min(end, h + 12)
    if (k.tup[h / 12]) {
      if ((o - h === 0 || o - h === 4) && o + 8 <= lim) return 8
      if (o % 4 === 0 && o + 4 <= lim) return 4
    } else return subRest(BIN, o, lim)
  }
  return end - o
}

/** 박 머리에서 시작해 한 박 이상 가는 음표: 4분·점4분·2분·점2분·온음표 중 박 묶음 규칙에 맞는 가장 긴 것 */
function longNote(s: number, e: number, kinds: Kind[], groups: [number, number][]): number {
  const g = groups.find(([a, b]) => s >= a && s < b)!
  for (const L of [144, 96, 72, 48, 36, 24]) {
    if (s + L > e) continue
    if (L === 36) {
      // 점4분은 딱 거기서 끝날 때만, 끝나는 박의 앞 반 박이 보통 박일 때만
      const k = kinds[s / U + 1]
      if (s + L !== e || !k || !(k.t === 'bin' || (k.t === 'half' && !k.tup[0]))) continue
    }
    if (s + L > g[1] && s !== g[0]) continue // 약박에서 시작해 박 묶음(마디 가운데)을 넘으면 안 됨
    return L
  }
  return U
}

/** 박 머리에서 시작하는 긴 쉼표: 박 묶음 머리면 2분쉼표, 아니면 4분쉼표 */
function longRest(s: number, e: number, groups: [number, number][]): number {
  const g = groups.find(([a, b]) => s >= a && s < b)!
  if (s === g[0] && g[1] - g[0] >= 48 && s + 48 <= e) return 48
  return U
}

/** [s, e) 를 붙임줄(음표) 또는 따로 쉼표로 이어질 조각들로 */
function spellSeg(s: number, e: number, rest: boolean, kinds: Kind[], groups: [number, number][]): [number, number][] {
  const out: [number, number][] = []
  while (s < e) {
    const j = Math.floor(s / U)
    const o = s - j * U
    let L: number
    if (o === 0 && e - s >= U) L = rest ? longRest(s, e, groups) : longNote(s, e, kinds, groups)
    else {
      const end = Math.min(e, (j + 1) * U) - j * U
      L = rest ? subRest(kinds[j], o, end) : subNote(kinds[j], o, end)
    }
    if (L <= 0) L = e - s // 안전장치 (여기 오면 안 됨)
    out.push([s, L])
    s += L
  }
  return out
}

/** 드럼 음표 길이: 다음 타격까지, 박 안에서 읽기 쉬운 만큼 (박 머리에서 1박 이상 비면 4분음표) */
function drumLen(s: number, n: number, kinds: Kind[], groups: [number, number][], half: boolean): number {
  const j = Math.floor(s / U)
  const o = s - j * U
  if (o === 0 && n - s >= U) {
    const g = groups.find(([a, b]) => s >= a && s < b)!
    if (half && s === g[0] && g[1] - g[0] >= 48 && n - s >= 48) return 48
    return U
  }
  return subNote(kinds[j], o, Math.min(n, (j + 1) * U) - j * U)
}

function tupletOf(kinds: Kind[], s: number, L: number): { key: string; num: number; inSpaceOf: number } | null {
  if (L >= U) return null
  const j = Math.floor(s / U)
  const k = kinds[j]
  if (k.t === 'tri') return { key: `t${j}`, num: 3, inSpaceOf: 2 }
  if (k.t === 'six') return { key: `s${j}`, num: 6, inSpaceOf: 4 }
  if (k.t === 'half') {
    const h = s - j * U < 12 ? 0 : 1
    if (k.tup[h]) return { key: `h${j}.${h}`, num: 3, inSpaceOf: 2 }
  }
  return null
}

function durOf(base: number): [Dur, 0 | 1] {
  const hit = DUR[Math.round(base * 1000) / 1000]
  if (hit) return hit
  // 안전장치: 못 적는 길이면 그보다 짧은 가장 긴 값
  let best: [Dur, 0 | 1] = ['32', 0]
  for (const k of Object.keys(DUR).map(Number).sort((a, b) => a - b)) if (k <= base) best = DUR[k]
  return best
}

interface Seg {
  s: number
  e: number
  c?: Chord
  attack?: boolean // 이 마디에서 새로 치는 화음 (앞 마디에서 이어진 게 아님)
  tieOut?: boolean // 다음 마디로 이어짐
}

function measureRest(bpb: number): ETick {
  return { kind: 'rest', start: 0, len: bpb, dur: 'w', dots: 0, measureRest: true }
}

/** 마디 하나 한 성부의 조각들 → 음표·쉼표 */
function segsToTicks(segs: Seg[], kinds: Kind[], groups: [number, number][], pitched: boolean, keyAlt: number[]): ETick[] {
  const ticks: ETick[] = []
  const tupIds = new Map<string, number>()
  const shown = new Map<number, number>() // (음이름·옥타브) → 이 마디에서 마지막으로 적힌 변화
  for (const g of segs) {
    const ps = spellSeg(g.s, g.e, !g.c, kinds, groups)
    ps.forEach(([s, L], pi) => {
      const tup = tupletOf(kinds, s, L)
      const [dur, dots] = durOf(tup ? (L * tup.num) / tup.inSpaceOf : L)
      const t: ETick = { kind: g.c ? 'note' : 'rest', start: s / U, len: L / U, dur, dots }
      if (tup) {
        let id = tupIds.get(tup.key)
        if (id === undefined) tupIds.set(tup.key, (id = tupIds.size))
        t.tuplet = { id, num: tup.num, inSpaceOf: tup.inSpaceOf }
      }
      const c = g.c
      if (c) {
        const attack = pi === 0 && !!g.attack
        t.keys = c.keys.map(k => {
          if (!pitched) return { ...k }
          const key = { ...k, showAcc: false }
          if (attack) {
            // 임시표: 조표와 다르거나, 이 마디 앞에서 같은 자리(음이름+옥타브)에 다른 변화를 적었으면
            const slot = k.octave! * 7 + k.step!
            const cur = shown.get(slot) ?? keyAlt[k.step!]
            key.showAcc = k.alter !== cur
            shown.set(slot, k.alter!)
          }
          return key
        })
        if (attack) {
          if (c.onsets.length) t.onset = c.onsets[0]
          if (c.onsets.length > 1) t.moreOnsets = c.onsets.slice(1)
          if (c.roll) t.roll = true
        }
        if (pitched && (pi < ps.length - 1 || g.tieOut)) t.tieToNext = true
        t.events = c.evs
      }
      ticks.push(t)
    })
  }
  return ticks
}

/** 악보 데이터 → 그릴 수 있는 악보 */
export function engrave(score: PartScore, opts: EngraveOptions): Engraved {
  const bpb = Math.max(1, Math.round(opts.beatsPerBar))
  const M = bpb * U
  const from = Math.max(1, Math.floor(opts.fromBar))
  const to = Math.max(from, Math.floor(opts.toBar))
  const groups = groupBounds(bpb)
  const pitched = score.type === 'pitched'
  const keySig = score.type === 'pitched' ? score.keySig : 0
  const keyAlt = keyAlterations(keySig)

  // 1) 성부 나누기
  const defs: { staff: number; stem: EVoice['stem']; items: Item[] }[] = []
  let clefs: EStaff['clef'][]
  if (score.type === 'drums') {
    clefs = ['percussion']
    const up: Item[] = []
    const down: Item[] = []
    score.events.forEach((e, i) => {
      const hands = e.n.filter(n => !DRUM_DOWN.has(n))
      const feet = e.n.filter(n => DRUM_DOWN.has(n))
      // 롤은 손 쪽 악기에 (손이 없을 때만 발)
      if (hands.length) up.push({ i, b: e.b, end: e.b, hard: true, keys: drumKeys(hands), roll: e.roll })
      if (feet.length) down.push({ i, b: e.b, end: e.b, hard: true, keys: drumKeys(feet), roll: hands.length ? false : e.roll })
    })
    defs.push({ staff: 0, stem: 'up', items: up }, { staff: 0, stem: 'down', items: down })
  } else {
    const clef = score.clef
    const grand = clef === 'grand'
    clefs = clef === 'grand' ? ['treble', 'bass'] : [clef]
    const shift = clef === 'treble8' ? 12 : 0 // 기타는 한 옥타브 위로 적는다
    const per: Item[][] = clefs.map(() => [])
    score.events.forEach((e, i) => {
      const staff = grand && (e.h ?? (e.p >= 60 ? 0 : 1)) === 1 ? 1 : 0
      const sp = spell(e.p + shift, score.keySig)
      per[staff].push({
        i,
        b: e.b,
        end: e.b + e.d,
        hard: !e.slur,
        keys: [{ step: sp.step, octave: sp.octave, alter: sp.alter, p: e.p, ...(e.slur ? { slur: true } : {}) }],
      })
    })
    per.forEach((items, staff) => defs.push({ staff, stem: 'auto', items }))
  }

  // 2) 성부마다 화음 묶고 박자 정리
  const voices = defs.map(d => buildVoice(d.items, pitched, bpb))

  // 3) 화음 모양 + onsetsOf idx 붙이기 (한 idx 는 한 음표에만: 손·높은음자리 쪽이 먼저)
  const onsetOfEvent = new Map<number, number>()
  for (const o of onsetsOf(score)) for (const i of o.notes) onsetOfEvent.set(i, o.idx)
  const owned = new Set<number>()
  for (const chords of voices) {
    for (const c of chords) {
      c.evs = c.items.map(it => it.i).sort((a, b) => a - b)
      c.roll = c.items.some(it => it.roll)
      if (pitched) {
        const byP = new Map<number, EKey>()
        for (const it of c.items)
          for (const k of it.keys) {
            const had = byP.get(k.p!)
            if (!had) byP.set(k.p!, { ...k })
            else if (!k.slur) delete had.slur // 같은 음을 한 줄은 새로 치면 새로 치는 음
          }
        c.keys = [...byP.values()].sort((a, b) => a.p! - b.p!)
      } else c.keys = drumKeys(c.items.flatMap(it => it.keys.map(k => k.inst!)))
      for (const it of c.items) {
        const k = it.hard ? onsetOfEvent.get(it.i) : undefined
        if (k !== undefined && !owned.has(k)) {
          owned.add(k)
          c.onsets.push(k)
        }
      }
      c.onsets.sort((a, b) => a - b)
    }
  }

  // 4) 마디마다 음표·쉼표로
  const measures: EMeasure[] = []
  const ptr = voices.map(() => 0)
  for (let m = from; m <= to; m++) {
    const mS = (m - 1) * M
    const mE = mS + M
    const staves: EStaff[] = clefs.map(clef => ({ clef, voices: [] }))
    voices.forEach((chords, vi) => {
      let k = ptr[vi]
      while (k < chords.length && (pitched ? chords[k].e <= mS : chords[k].s < mS)) k++
      ptr[vi] = k
      const inM: Chord[] = []
      for (let q = k; q < chords.length && chords[q].s < mE; q++) inM.push(chords[q])
      let ticks: ETick[]
      if (!inM.length) ticks = [measureRest(bpb)]
      else if (pitched) {
        const segs: Seg[] = []
        let t = 0
        for (const c of inM) {
          const s = Math.max(c.s - mS, 0)
          const e = Math.min(c.e - mS, M)
          if (s > t) segs.push({ s: t, e: s })
          segs.push({ s, e, c, attack: c.s >= mS, tieOut: c.e > mE })
          t = e
        }
        if (t < M) segs.push({ s: t, e: M })
        ticks = segsToTicks(segs, kindsOf(segs.flatMap(g => [g.s, g.e]), bpb), groups, true, keyAlt)
      } else {
        // 드럼: 음 길이는 정해져 있지 않으니 다음 타격까지 읽기 쉬운 만큼 적고 나머지는 쉼표 (붙임줄 없음)
        const st = inM.map(c => c.s - mS)
        const kinds = kindsOf(st, bpb)
        const segs: Seg[] = []
        if (st[0] > 0) segs.push({ s: 0, e: st[0] })
        inM.forEach((c, q) => {
          const s = st[q]
          const n = q + 1 < st.length ? st[q + 1] : M
          const L = drumLen(s, n, kinds, groups, !!opts.drumHalfNotes)
          segs.push({ s, e: s + L, c, attack: true })
          if (s + L < n) segs.push({ s: s + L, e: n })
        })
        ticks = segsToTicks(segs, kinds, groups, false, keyAlt)
      }
      staves[defs[vi].staff].voices.push({ stem: defs[vi].stem, ticks })
    })
    // 드럼 마디가 통째로 비면 쉼표 하나만
    if (!pitched && staves[0].voices.every(v => v.ticks.length === 1 && v.ticks[0].measureRest))
      staves[0].voices = [{ stem: 'auto', ticks: [measureRest(bpb)] }]
    measures.push({ m, staves })
  }
  return { type: score.type, keySig, beatsPerBar: bpb, measures }
}

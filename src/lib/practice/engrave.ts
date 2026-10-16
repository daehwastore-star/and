// 악보 데이터(score.ts 의 PartScore: 시작 박·길이만 있는 음 목록) → 실제 악보로 그릴 수 있는 모양.
// 마디마다 성부(voice)별로 음표·쉼표를 빈틈없이 채우고, 길이를 표준 음표(온·2분·4분·8분·16분·32분, 점, 잇단음표)로 바꾼다.
// 그리는 쪽(VexFlow)은 여기 결과만 보고 그린다 — 박자 계산은 전부 여기서.
//
// ※ 계약(타입)은 그리는 쪽과 같이 쓰므로 바꿀 때 둘 다 맞출 것.

import type { PartScore } from './score'

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
  /** 이 음표에서 새로 치면 onsetsOf() 의 idx (붙임줄로 이어진 뒤쪽 조각·slur 만 있는 음표는 없음) */
  onset?: number
  /** 다음 tick(마디를 넘어가도)과 붙임줄로 이어짐 */
  tieToNext?: boolean
  /** 드럼 롤 (트레몰로 빗금) */
  roll?: boolean
  /** 원본 이벤트 번호 (score.events 인덱스) — 디버그·검증용 */
  events?: number[]
}

export interface EVoice {
  /** 기둥 방향: 드럼 손 = up, 발 = down. 음높이 악보 한 성부면 auto */
  stem: 'up' | 'down' | 'auto'
  /** start 순서대로, 마디를 빈틈없이 채운다 (len 합 = beatsPerBar) */
  ticks: ETick[]
}

export interface EStaff {
  clef: 'percussion' | 'treble' | 'treble8' | 'bass'
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
}

/** 악보 데이터 → 그릴 수 있는 악보. 구현은 아래 (계약 먼저, 구현은 따로 채운다) */
export function engrave(score: PartScore, opts: EngraveOptions): Engraved {
  void score
  void opts
  throw new Error('engrave: not implemented yet')
}

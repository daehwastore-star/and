// 혼자 연습 파트 — 화면에 나오는 순서·이름
export const PARTS: { key: string; label: string; emoji: string }[] = [
  { key: 'metronome', label: '메트로놈', emoji: '⏱️' },
  { key: 'drums', label: '드럼', emoji: '🥁' },
  { key: 'guitar', label: '일렉기타', emoji: '🎸' }, // 기타 악보가 한 줄뿐인 곡
  { key: 'guitar-lead', label: '일렉 리드', emoji: '🎸' },
  { key: 'guitar-rhythm', label: '일렉 리듬', emoji: '🎸' },
  { key: 'keys', label: '키보드', emoji: '🎹' },
  { key: 'bass', label: '베이스', emoji: '🎻' },
]
export const PART_KEYS = PARTS.map(p => p.key)

export function partInfo(key: string) {
  return PARTS.find(p => p.key === key) ?? { key, label: key, emoji: '🎵' }
}

/** 내가 치는 악기 → 그 파트를 빼고 트는 데 쓰는 파트 키들 */
export const MY_INSTRUMENTS: { key: string; label: string; emoji: string; parts: string[] }[] = [
  { key: 'drums', label: '드럼', emoji: '🥁', parts: ['drums'] },
  { key: 'guitar', label: '일렉', emoji: '🎸', parts: ['guitar', 'guitar-lead', 'guitar-rhythm'] },
  { key: 'keys', label: '키보드', emoji: '🎹', parts: ['keys'] },
  { key: 'bass', label: '베이스', emoji: '🎻', parts: ['bass'] },
]

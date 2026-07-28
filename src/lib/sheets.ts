// 악보 파트별 이모지 (합주곡 목록에서 어떤 악보가 있는지 표시)
export const SHEET_PARTS: { key: string; emoji: string }[] = [
  { key: '보컬', emoji: '🎤' },
  { key: '드럼', emoji: '🥁' },
  { key: '베이스', emoji: '🎻' },
  { key: '일렉기타', emoji: '🎸' },
  { key: '어쿠스틱기타', emoji: '🪕' },
  { key: '키보드', emoji: '🎹' },
  { key: '합주/기타', emoji: '📄' },
]

export function partEmoji(part: string): string {
  return SHEET_PARTS.find(p => p.key === part)?.emoji ?? '📄'
}

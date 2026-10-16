// 업로드 미디어 파일 구분
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']
export const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v']
export const AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.aac']
// 연습 음원 칸에는 MIDI 도 올릴 수 있다. 브라우저가 재생은 못 하니 받기만 한다.
export const MIDI_EXT = ['.mid', '.midi']
export const TRACK_EXT = [...AUDIO_EXT, ...MIDI_EXT]

export function isMidiFile(name: string): boolean {
  const lower = name.toLowerCase()
  return MIDI_EXT.some(ext => lower.endsWith(ext))
}

export function isVideoFile(name: string): boolean {
  const lower = name.toLowerCase()
  return VIDEO_EXT.some(ext => lower.endsWith(ext))
}

/**
 * <video poster> 에 넣을 썸네일 주소.
 * 썸네일이 없으면 undefined 를 준다 — 빈 문자열을 넣으면 브라우저가
 * 없는 주소를 받아오려다 실패해 오히려 깨진 그림이 뜬다.
 */
export function posterUrl(
  media: { file: string; thumb?: string | null }[],
  file: string,
): string | undefined {
  const thumb = media.find(m => m.file === file)?.thumb
  return thumb ? `/api/photos/${thumb}` : undefined
}

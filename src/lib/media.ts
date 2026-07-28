// 업로드 미디어 파일 구분
export const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']
export const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v']

export function isVideoFile(name: string): boolean {
  const lower = name.toLowerCase()
  return VIDEO_EXT.some(ext => lower.endsWith(ext))
}

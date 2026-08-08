import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { stat, rm, rename } from 'fs/promises'

const run = promisify(execFile)

// 요즘 폰 사진은 한 장에 4000px, 4~5MB 다. 원본 그대로 쌓으면
// 서버 용량도 백업도 계속 불어나고, 목록을 열 때 내려받는 데도 오래 걸린다.
// 그렇다고 "용량이 크다" 며 퇴짜를 놓으면 올린 사람만 답답하다 —
// 받아서 알맞은 크기로 줄여 저장한다.
//
// 긴 변 2400px 이면 폰에서도 PC 에서도 충분하고, 보통 4MB → 500KB 안팎이 된다.
// 줄이는 건 ffmpeg 으로 한다(썸네일 뽑을 때 쓰는 그 프로그램 그대로 —
// 새 도구를 더 깔지 않으려고).
const MAX_EDGE = 2400

// 사진 용량 상한. 줄여서 저장하니 원래는 필요 없지만, 파일을 통째로 메모리에
// 올린 뒤에 줄이기 때문에 터무니없이 큰 게 들어오면 서버가 휘청인다.
// 폰 사진이 5MB 안팎이니 50MB 면 사실상 안 걸린다 — 방어선일 뿐이다.
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024

// ffmpeg 이 다룰 수 있고, 줄여도 탈이 없는 형식만.
//  · heic 는 서버 ffmpeg 이 못 푼다 → 건드리지 않고 원본을 둔다
//  · gif 는 움직이는 그림이라 손대면 첫 장면만 남는다 → 제외
const SHRINKABLE = new Set(['.jpg', '.jpeg', '.png', '.webp'])

async function sizeOf(path: string): Promise<{ w: number; h: number } | null> {
  try {
    const { stdout } = await run(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
       '-of', 'csv=p=0:s=x', path],
      { timeout: 15_000 },
    )
    const [w, h] = stdout.trim().split('x').map(Number)
    return w > 0 && h > 0 ? { w, h } : null
  } catch {
    return null
  }
}

/**
 * 저장된 사진이 너무 크면 그 자리에서 줄인다.
 * 줄였으면 true, 그대로 뒀으면 false. 실패해도 원본은 절대 건드리지 않는다.
 */
export async function shrinkImage(filename: string, ext: string): Promise<boolean> {
  if (!SHRINKABLE.has(ext)) return false
  const dir = join(process.cwd(), 'uploads')
  const src = join(dir, filename)

  const dim = await sizeOf(src)
  if (!dim) return false                                   // 못 읽는 형식 — 원본 유지
  if (Math.max(dim.w, dim.h) <= MAX_EDGE) return false      // 이미 충분히 작다

  // 새 파일로 먼저 만들고, 제대로 나왔을 때만 원본과 바꿔치기한다.
  // 원본 위에 바로 쓰면 중간에 실패했을 때 사진이 통째로 날아간다.
  const tmp = join(dir, `shrinking-${filename}`)
  try {
    await run(
      'ffmpeg',
      ['-y', '-i', src,
       // 2400x2400 안에 들어가도록 비율을 지키며 줄인다. 이미 작은 사진은
       // 위에서 걸러냈으니 여기로 오지 않는다(늘어날 일이 없다).
       '-vf', `scale=w=${MAX_EDGE}:h=${MAX_EDGE}:force_original_aspect_ratio=decrease`,
       '-q:v', '4',
       tmp],
      { timeout: 60_000 },
    )
    const made = await stat(tmp)
    // 줄였는데 오히려 커졌으면(작은 PNG 등) 원본이 낫다
    if (made.size > 0 && made.size < (await stat(src)).size) {
      await rename(tmp, src)
      return true
    }
  } catch {
    // 아래에서 임시파일만 치우고 원본을 그대로 둔다
  }
  await rm(tmp, { force: true })
  return false
}

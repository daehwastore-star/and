import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'

const run = promisify(execFile)

// 영상 앞 3초를 GIF로 변환 (ffmpeg 필요 — 없거나 실패하면 null, 기능은 계속 동작)
export async function makeGifPreview(videoFilename: string): Promise<string | null> {
  try {
    const dir = join(process.cwd(), 'uploads')
    const out = `${randomUUID()}.gif`
    await run(
      'ffmpeg',
      [
        '-y',
        '-t', '3', // 앞 3초만
        '-i', join(dir, videoFilename),
        '-vf', 'fps=10,scale=360:-1:flags=lanczos',
        '-loop', '0',
        join(dir, out),
      ],
      { timeout: 60000 },
    )
    return out
  } catch {
    return null
  }
}

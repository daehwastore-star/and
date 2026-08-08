import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { stat, rm } from 'fs/promises'

const run = promisify(execFile)

// 올린 영상에서 미리보기를 뽑는다. 두 종류다.
//  · 썸네일(JPEG) — 목록에 깔아두는 정지 화면.
//  · GIF — 연습 모아보기에서 소리 없이 저절로 움직이는 3초짜리.
//
// 둘 다 ffmpeg 이 있어야 한다. 없거나 실패하면 null 을 돌려주고 업로드는 그대로 진행한다
// (미리보기가 없어도 영상 자체는 재생되니, 이것 때문에 글쓰기가 막히면 안 된다).
// null 이 남은 건 나중에 `node scripts/backfill-video-thumbs.mjs` 로 채운다.
const UPLOADS = () => join(process.cwd(), 'uploads')

/**
 * 영상의 정지 썸네일(JPEG) 파일명을 돌려준다.
 *
 * 목록에서 <video> 를 그냥 두면 모바일 사파리·크롬이 첫 프레임을 그려주지 않아
 * 검은 네모만 뜬다. 이 파일을 poster 로 깔아 그 검은 화면을 없앤다.
 */
export async function makeVideoThumb(videoFilename: string): Promise<string | null> {
  const dir = UPLOADS()
  const src = join(dir, videoFilename)
  // 맨 첫 프레임은 어둡거나 흔들린 게 많아 1초 지점을 먼저 본다.
  // 1초보다 짧은 영상은 거기서 아무것도 안 나오므로 0초로 한 번 더 시도한다.
  for (const seek of ['1', '0']) {
    const out = `${randomUUID()}.jpg`
    const outPath = join(dir, out)
    try {
      await run(
        'ffmpeg',
        [
          '-y',
          '-ss', seek,
          '-i', src,
          '-frames:v', '1',
          // 가로 720 까지만 줄인다. 그냥 `scale=720:-1` 로 하면 480 짜리 옛날 영상을
          // 720 으로 늘려버려서 흐릿하고 파일만 커진다 — 원본보다 키우지 않는다.
          // 쉼표는 ffmpeg 필터 문법상 인자 구분자라 역슬래시로 막아야 한다.
          '-vf', 'scale=min(720\\,iw):-1',
          '-q:v', '4',
          outPath,
        ],
        { timeout: 30_000 },
      )
      // ffmpeg 은 프레임을 못 찾아도 0바이트 파일을 남기고 성공으로 끝나는 경우가 있다
      if ((await stat(outPath)).size > 0) return out
    } catch {
      // 다음 seek 로 넘어간다
    }
    await rm(outPath, { force: true })
  }
  return null
}

/** 영상 앞 3초를 GIF 로 만들어 파일명을 돌려준다. */
export async function makeGifPreview(videoFilename: string): Promise<string | null> {
  try {
    const dir = UPLOADS()
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

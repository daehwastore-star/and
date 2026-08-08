#!/usr/bin/env node
// 썸네일·GIF 가 비어 있는 영상을 뒤늦게 채운다.
//
//   node scripts/backfill-video-thumbs.mjs
//
// 올릴 때 ffmpeg 이 없었거나 변환이 실패하면 preview/thumb 이 null 로 남는다
// (미리보기 하나 때문에 글쓰기가 막히면 안 되니 일부러 그렇게 뒀다).
// 그렇게 빈 채로 남은 것들을 나중에 이걸로 메운다. 여러 번 돌려도 안전하다 —
// 이미 채워진 건 건너뛴다.
//
// ⚠️ ffmpeg 인자는 src/lib/videoPreview.ts 와 같게 유지할 것.
//    (앱은 그쪽을 쓰고 여기는 수리용이다. 둘이 어긋나면 새 영상과 옛 영상의
//     미리보기 크기가 달라진다)
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { stat, rm, access } from 'fs/promises'

const run = promisify(execFile)
const UPLOADS = join(process.cwd(), 'uploads')
const VIDEO_EXT = ['.mp4', '.mov', '.webm', '.m4v'] // src/lib/media.ts 와 동일

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: `file://${join(process.cwd(), 'dev.db')}` }),
})

async function makeThumb(file) {
  for (const seek of ['1', '0']) {
    const out = `${randomUUID()}.jpg`
    const outPath = join(UPLOADS, out)
    try {
      await run(
        'ffmpeg',
        ['-y', '-ss', seek, '-i', join(UPLOADS, file), '-frames:v', '1',
         '-vf', 'scale=min(720\\,iw):-1', '-q:v', '4', outPath],
        { timeout: 30_000 },
      )
      if ((await stat(outPath)).size > 0) return out
    } catch {
      // 다음 seek 로
    }
    await rm(outPath, { force: true })
  }
  return null
}

async function makeGif(file) {
  const out = `${randomUUID()}.gif`
  try {
    await run(
      'ffmpeg',
      ['-y', '-t', '3', '-i', join(UPLOADS, file),
       '-vf', 'fps=10,scale=360:-1:flags=lanczos', '-loop', '0', join(UPLOADS, out)],
      { timeout: 60_000 },
    )
    return out
  } catch {
    await rm(join(UPLOADS, out), { force: true })
    return null
  }
}

const rows = await prisma.journalMedia.findMany({
  where: { OR: [{ thumb: null }, { preview: null }] },
})
const videos = rows.filter(m => VIDEO_EXT.some(e => m.file.toLowerCase().endsWith(e)))

console.log(`미리보기가 빈 영상 ${videos.length}개`)
let fixed = 0
let failed = 0
for (const m of videos) {
  // 파일이 지워졌으면 건너뛴다 (DB 행만 남은 경우)
  try {
    await access(join(UPLOADS, m.file))
  } catch {
    console.log(`  · ${m.file} — 파일이 없어 건너뜀`)
    continue
  }

  const data = {}
  if (!m.thumb) {
    const t = await makeThumb(m.file)
    if (t) data.thumb = t
  }
  if (!m.preview) {
    const g = await makeGif(m.file)
    if (g) data.preview = g
  }

  if (Object.keys(data).length === 0) {
    failed++
    console.log(`  ✗ ${m.file} — 변환 실패 (ffmpeg 설치 여부 확인)`)
    continue
  }
  await prisma.journalMedia.update({ where: { id: m.id }, data })
  fixed++
  console.log(`  ✓ ${m.file} → ${JSON.stringify(data)}`)
}

console.log(`\n완료: ${fixed}개 채움, ${failed}개 실패`)
await prisma.$disconnect()

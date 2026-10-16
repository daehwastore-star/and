import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { PART_KEYS } from '@/lib/practice/parts'
import { validScore } from '@/lib/practice/validate'

const MAX_BYTES = 30 * 1024 * 1024
const EXT = ['.mp3', '.m4a']

// 파트 음원 올리기 (같은 파트가 있으면 갈아끼운다). FormData: file, part
export async function POST(req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const song = await prisma.song.findUnique({ where: { id: songId } })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // 통째로 메모리에 받기 전에 크기부터 (악보 데이터 몫으로 1MB 여유)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 1024 * 1024)
    return NextResponse.json({ error: '30MB 이하만 올릴 수 있어요' }, { status: 413 })

  const form = await req.formData()
  const file = form.get('file')
  const part = String(form.get('part') ?? '')
  const scoreRaw = form.get('score')
  const score = typeof scoreRaw === 'string' && scoreRaw ? scoreRaw : null
  if (score && !validScore(score)) return NextResponse.json({ error: '악보 데이터가 이상해요' }, { status: 400 })
  if (!PART_KEYS.includes(part)) return NextResponse.json({ error: '알 수 없는 파트예요' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: '음원 파일을 첨부해주세요' }, { status: 400 })
  const ext = extname(file.name).toLowerCase()
  if (!EXT.includes(ext)) return NextResponse.json({ error: 'MP3·M4A 만 올릴 수 있어요' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '30MB 이하만 올릴 수 있어요' }, { status: 400 })

  const dir = join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  const stored = `${randomUUID()}${ext}`
  await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()))
  let old: { file: string } | null = null
  let stem
  try {
    old = await prisma.practiceStem.findUnique({ where: { songId_part: { songId, part } } })
    stem = await prisma.practiceStem.upsert({
      where: { songId_part: { songId, part } },
      create: { songId, part, file: stored, score },
      update: score ? { file: stored, score } : { file: stored },
    })
  } catch (e) {
    await rm(join(dir, stored), { force: true })
    throw e
  }
  // 옛 파일 지우기는 실패해도 괜찮다 (새 파일은 이미 DB 에 연결됨)
  if (old && old.file !== stored) await rm(join(dir, old.file), { force: true }).catch(() => {})
  return NextResponse.json({ ok: true, stem: { ...stem, score: undefined, hasScore: !!stem.score } })
}

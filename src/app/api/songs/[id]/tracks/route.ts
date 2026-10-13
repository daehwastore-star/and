import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { AUDIO_EXT } from '@/lib/media'

const MAX_BYTES = 50 * 1024 * 1024

// FormData: file, label?, uploader?
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const song = await prisma.song.findUnique({ where: { id } })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file')
  const uploader = String(form.get('uploader') ?? '').trim() || null
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: '음원 파일을 첨부해주세요' }, { status: 400 })

  // 저장하기 전에 다 검사한다 — 퇴짜 맞을 파일을 디스크에 먼저 쓰면 주인 없는 파일이 남는다
  const ext = extname(file.name).toLowerCase()
  if (!AUDIO_EXT.includes(ext))
    return NextResponse.json({ error: 'MP3·M4A·WAV 음원만 올릴 수 있어요' }, { status: 400 })
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: '50MB 이하 음원만 올릴 수 있어요' }, { status: 400 })

  const label =
    String(form.get('label') ?? '').trim().slice(0, 60) || file.name.replace(/\.[^.]+$/, '').slice(0, 60)

  const dir = join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  const stored = `${randomUUID()}${ext}`
  await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()))

  try {
    const track = await prisma.practiceTrack.create({
      data: { songId: id, label, uploader, file: stored, filename: file.name },
    })
    return NextResponse.json({ ok: true, track })
  } catch (e) {
    // 기록이 안 남았으면 방금 쓴 파일도 지운다 (그 사이 곡이 삭제된 경우 등)
    await rm(join(dir, stored), { force: true })
    throw e
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']

// FormData: part, uploader?, file
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const song = await prisma.song.findUnique({ where: { id } })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const part = String(form.get('part') ?? '').trim()
  const uploader = String(form.get('uploader') ?? '').trim() || null
  const file = form.get('file')

  if (!part) return NextResponse.json({ error: '어떤 파트 악보인지 골라주세요' }, { status: 400 })
  if (!(file instanceof File) || file.size === 0)
    return NextResponse.json({ error: '악보 파일을 첨부해주세요' }, { status: 400 })
  if (file.size > 20 * 1024 * 1024)
    return NextResponse.json({ error: '20MB 이하 파일만 올릴 수 있어요' }, { status: 400 })

  const ext = extname(file.name).toLowerCase() || '.pdf'
  if (!ALLOWED_EXT.includes(ext))
    return NextResponse.json({ error: 'PDF나 이미지 파일만 올릴 수 있어요' }, { status: 400 })

  const dir = join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  const stored = `${randomUUID()}${ext}`
  await writeFile(join(dir, stored), Buffer.from(await file.arrayBuffer()))

  const sheet = await prisma.sheetMusic.create({
    data: { songId: id, part, uploader, file: stored, filename: file.name },
  })
  return NextResponse.json({ ok: true, sheet })
}

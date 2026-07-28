import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']

export async function GET() {
  const entries = await prisma.journalEntry.findMany({
    orderBy: { createdAt: 'desc' },
    include: { rehearsal: true },
  })
  return NextResponse.json({ entries })
}

// FormData: text?, author?, rehearsalId?, photo?(File)
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const text = String(form.get('text') ?? '').trim() || null
  const author = String(form.get('author') ?? '').trim() || null
  const rehearsalId = String(form.get('rehearsalId') ?? '').trim() || null
  const file = form.get('photo')

  let photo: string | null = null
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024)
      return NextResponse.json({ error: '15MB 이하 사진만 올릴 수 있어요' }, { status: 400 })
    const ext = extname(file.name).toLowerCase() || '.jpg'
    if (!ALLOWED_EXT.includes(ext))
      return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요' }, { status: 400 })
    const dir = join(process.cwd(), 'uploads')
    await mkdir(dir, { recursive: true })
    photo = `${randomUUID()}${ext}`
    await writeFile(join(dir, photo), Buffer.from(await file.arrayBuffer()))
  }

  if (!text && !photo)
    return NextResponse.json({ error: '사진이나 내용을 하나는 넣어주세요' }, { status: 400 })

  // rehearsalId 유효성 확인 (없으면 null로 저장)
  const rehearsal = rehearsalId
    ? await prisma.rehearsal.findUnique({ where: { id: rehearsalId } })
    : null

  const entry = await prisma.journalEntry.create({
    data: { text, author, photo, rehearsalId: rehearsal?.id ?? null },
    include: { rehearsal: true },
  })
  return NextResponse.json({ ok: true, entry })
}

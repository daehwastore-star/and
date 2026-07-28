import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const form = await req.formData()
  const file = form.get('photo')
  if (!(file instanceof File))
    return NextResponse.json({ error: '사진 파일을 첨부해주세요' }, { status: 400 })
  if (file.size > 10 * 1024 * 1024)
    return NextResponse.json({ error: '10MB 이하 사진만 올릴 수 있어요' }, { status: 400 })

  const ext = extname(file.name).toLowerCase() || '.jpg'
  if (!ALLOWED_EXT.includes(ext))
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요' }, { status: 400 })

  const dir = join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  const filename = `${randomUUID()}${ext}`
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()))

  const member = await prisma.member.update({
    where: { id },
    data: { photo: filename },
  })
  return NextResponse.json({ ok: true, member })
}

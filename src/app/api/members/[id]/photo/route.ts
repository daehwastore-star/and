import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir, rm } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { shrinkImage, MAX_IMAGE_BYTES } from '@/lib/image'

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic']

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const form = await req.formData()
  const file = form.get('photo')
  if (!(file instanceof File))
    return NextResponse.json({ error: '사진 파일을 첨부해주세요' }, { status: 400 })
  // 큰 사진이라고 돌려보내지 않는다 — 받아서 줄인다(아래 shrinkImage).
  // 상한은 서버 메모리를 지키는 최후의 방어선일 뿐이라 넉넉하게 둔다.
  if (file.size > MAX_IMAGE_BYTES)
    return NextResponse.json({ error: '사진이 너무 커요 (50MB 이하)' }, { status: 400 })

  const ext = extname(file.name).toLowerCase() || '.jpg'
  if (!ALLOWED_EXT.includes(ext))
    return NextResponse.json({ error: '이미지 파일만 올릴 수 있어요' }, { status: 400 })

  const dir = join(process.cwd(), 'uploads')
  await mkdir(dir, { recursive: true })
  const filename = `${randomUUID()}${ext}`
  await writeFile(join(dir, filename), Buffer.from(await file.arrayBuffer()))
  await shrinkImage(filename, ext)

  // 바꾸기 전 사진의 파일명을 기억해 뒀다가 지운다.
  // 예전엔 그냥 두고 갈아치워서, 프로필을 바꿀 때마다 아무도 안 보는 사진이
  // uploads 에 하나씩 쌓였다.
  const before = await prisma.member.findUnique({ where: { id }, select: { photo: true } })
  const member = await prisma.member.update({
    where: { id },
    data: { photo: filename },
  })
  if (before?.photo && before.photo !== filename) {
    // 혹시 다른 데서도 쓰는 파일이면 두고, 아무도 안 쓸 때만 지운다
    const stillUsed = await prisma.member.count({ where: { photo: before.photo } })
    if (stillUsed === 0) await rm(join(dir, before.photo), { force: true })
  }
  return NextResponse.json({ ok: true, member })
}

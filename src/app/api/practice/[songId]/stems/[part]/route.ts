import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rm } from 'fs/promises'
import { join } from 'path'
import { validScore } from '@/lib/practice/validate'

// 파트 악보 데이터만 바꾸기 (음원은 그대로). body: { score: string }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ songId: string; part: string }> }) {
  const { songId, part } = await params
  const stem = await prisma.practiceStem.findUnique({ where: { songId_part: { songId, part } } })
  if (!stem) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const score = typeof body.score === 'string' ? body.score : null
  if (!score || !validScore(score)) return NextResponse.json({ error: '악보 데이터가 이상해요' }, { status: 400 })
  await prisma.practiceStem.update({ where: { id: stem.id }, data: { score } })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ songId: string; part: string }> }) {
  const { songId, part } = await params
  const stem = await prisma.practiceStem.findUnique({ where: { songId_part: { songId, part } } })
  if (!stem) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.practiceStem.delete({ where: { id: stem.id } })
  await rm(join(process.cwd(), 'uploads', stem.file), { force: true })
  return NextResponse.json({ ok: true })
}

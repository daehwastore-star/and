import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 좋아요 토글: { memberId }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const memberId = typeof body.memberId === 'string' ? body.memberId : ''
  if (!memberId) return NextResponse.json({ error: '멤버 정보가 없어요' }, { status: 400 })

  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.journalLike.findUnique({
    where: { entryId_memberId: { entryId: id, memberId } },
  })
  if (existing) {
    await prisma.journalLike.delete({ where: { id: existing.id } })
  } else {
    await prisma.journalLike.create({ data: { entryId: id, memberId } })
  }
  const count = await prisma.journalLike.count({ where: { entryId: id } })
  return NextResponse.json({ ok: true, liked: !existing, count })
}

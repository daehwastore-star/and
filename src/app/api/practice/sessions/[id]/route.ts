import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 내 연습 기록 지우기 (?memberId= 가 기록 주인과 같아야 지운다)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const memberId = req.nextUrl.searchParams.get('memberId')
  const s = await prisma.practiceSession.findUnique({ where: { id } })
  if (!s) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!memberId || s.memberId !== memberId) return NextResponse.json({ error: '내 기록만 지울 수 있어요' }, { status: 403 })
  await prisma.practiceSession.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

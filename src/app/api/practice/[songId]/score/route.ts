import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 파트 악보 데이터 (?part=drums)
export async function GET(req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const part = req.nextUrl.searchParams.get('part') ?? ''
  const stem = await prisma.practiceStem.findUnique({ where: { songId_part: { songId, part } }, select: { score: true } })
  if (!stem?.score) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(stem.score, { headers: { 'Content-Type': 'application/json' } })
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 내 연습 기록만 — memberId 없이는 아무것도 안 준다 (남의 기록은 안 보이게)
export async function GET(req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const memberId = req.nextUrl.searchParams.get('memberId')
  const part = req.nextUrl.searchParams.get('part')
  if (!memberId) return NextResponse.json({ sessions: [] })
  const sessions = await prisma.practiceSession.findMany({
    where: { songId, memberId, ...(part ? { part } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const b = await req.json().catch(() => null)
  if (!b || typeof b.memberId !== 'string') return NextResponse.json({ error: '누가 연습했는지 몰라요' }, { status: 400 })
  const [member, song] = await Promise.all([
    prisma.member.findUnique({ where: { id: b.memberId } }),
    prisma.song.findUnique({ where: { id: songId } }),
  ])
  if (!member || !song) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const result = typeof b.result === 'string' ? b.result : ''
  if (!result || result.length > 300_000) return NextResponse.json({ error: '결과가 너무 커요' }, { status: 400 })
  const session = await prisma.practiceSession.create({
    data: {
      memberId: member.id,
      songId,
      part: String(b.part ?? '').slice(0, 30) || 'drums',
      fromBar: Math.round(num(b.fromBar)),
      toBar: Math.round(num(b.toBar)),
      bpm: num(b.bpm),
      accuracy: Math.round(num(b.accuracy)),
      medianDev: num(b.medianDev),
      meanAbs: num(b.meanAbs),
      missed: Math.round(num(b.missed)),
      extras: Math.round(num(b.extras)),
      calibrated: !!b.calibrated,
      result,
    },
  })
  return NextResponse.json({ ok: true, session })
}

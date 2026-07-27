import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 한 멤버의 투표를 한 번에 저장: { memberId, votes: [{ optionId, available }] }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const memberId = typeof body.memberId === 'string' ? body.memberId : ''
  const votes: { optionId: string; available: boolean }[] = Array.isArray(body.votes)
    ? body.votes.filter(
        (v: unknown): v is { optionId: string; available: boolean } =>
          typeof v === 'object' && v !== null &&
          typeof (v as Record<string, unknown>).optionId === 'string' &&
          typeof (v as Record<string, unknown>).available === 'boolean',
      )
    : []

  if (!memberId) return NextResponse.json({ error: '멤버를 선택해주세요' }, { status: 400 })

  const poll = await prisma.schedulePoll.findUnique({
    where: { id },
    include: { options: true },
  })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (poll.closed) return NextResponse.json({ error: '마감된 투표예요' }, { status: 400 })

  const optionIds = new Set(poll.options.map(o => o.id))
  const valid = votes.filter(v => optionIds.has(v.optionId))

  for (const v of valid) {
    await prisma.pollVote.upsert({
      where: { optionId_memberId: { optionId: v.optionId, memberId } },
      create: { optionId: v.optionId, memberId, available: v.available },
      update: { available: v.available },
    })
  }
  return NextResponse.json({ ok: true })
}

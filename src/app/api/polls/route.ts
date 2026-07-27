import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const polls = await prisma.schedulePoll.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      options: { orderBy: { startsAt: 'asc' }, include: { votes: true } },
    },
  })
  return NextResponse.json({ polls })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const options: string[] = Array.isArray(body.options) ? body.options : []
  const dates = options
    .map(o => new Date(o))
    .filter(d => !isNaN(d.getTime()))

  if (!title) return NextResponse.json({ error: '제목을 입력해주세요' }, { status: 400 })
  if (dates.length === 0)
    return NextResponse.json({ error: '후보 날짜를 1개 이상 추가해주세요' }, { status: 400 })

  const poll = await prisma.schedulePoll.create({
    data: {
      title,
      options: { create: dates.map(d => ({ startsAt: d })) },
    },
    include: { options: true },
  })
  return NextResponse.json({ ok: true, poll })
}

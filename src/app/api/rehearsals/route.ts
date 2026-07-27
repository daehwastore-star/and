import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseAttendees } from '@/lib/parse'

export async function GET() {
  const rehearsals = await prisma.rehearsal.findMany({
    orderBy: { date: 'desc' },
    include: { attendances: { include: { member: true } } },
  })
  return NextResponse.json({ rehearsals })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const date = new Date(body.date)
  if (isNaN(date.getTime()))
    return NextResponse.json({ error: '날짜를 입력해주세요' }, { status: 400 })

  const hours = Number(body.hours) || 2
  const roomCost = Math.max(0, Math.round(Number(body.roomCost) || 0))
  const afterPartyCost = Math.max(0, Math.round(Number(body.afterPartyCost) || 0))
  const memo = typeof body.memo === 'string' ? body.memo.trim() || null : null
  const attendees = parseAttendees(body.attendees)

  if (attendees.length === 0)
    return NextResponse.json({ error: '참석자를 1명 이상 선택해주세요' }, { status: 400 })

  const rehearsal = await prisma.rehearsal.create({
    data: {
      date, hours, roomCost, afterPartyCost, memo,
      attendances: {
        create: attendees.map(a => ({
          memberId: a.memberId,
          late: a.late,
          afterParty: a.afterParty,
        })),
      },
    },
    include: { attendances: { include: { member: true } } },
  })
  return NextResponse.json({ ok: true, rehearsal })
}

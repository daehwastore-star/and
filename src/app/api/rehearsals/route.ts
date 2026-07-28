import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseAttendees, parseSongIds } from '@/lib/parse'

export async function GET() {
  const rehearsals = await prisma.rehearsal.findMany({
    orderBy: { date: 'desc' },
    include: {
      attendances: { include: { member: true } },
      songs: { include: { song: true } },
    },
  })
  return NextResponse.json({ rehearsals })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const date = new Date(body.date)
  if (isNaN(date.getTime()))
    return NextResponse.json({ error: '날짜를 입력해주세요' }, { status: 400 })

  const type = body.type === '공연' ? '공연' : '합주'
  const hours = Number(body.hours) || 2
  const roomCost = Math.max(0, Math.round(Number(body.roomCost) || 0))
  const afterPartyCost = Math.max(0, Math.round(Number(body.afterPartyCost) || 0))
  const memo = typeof body.memo === 'string' ? body.memo.trim() || null : null
  // 일정만 먼저 만드는 경우 참석자 없이 생성 가능 (정산 때 채움)
  const attendees = parseAttendees(body.attendees)
  const songIds = parseSongIds(body.songIds)

  const rehearsal = await prisma.rehearsal.create({
    data: {
      type, date, hours, roomCost, afterPartyCost, memo,
      attendances: {
        create: attendees.map(a => ({
          memberId: a.memberId,
          late: a.late,
          afterParty: a.afterParty,
        })),
      },
      songs: { create: songIds.map(songId => ({ songId })) },
    },
    include: {
      attendances: { include: { member: true } },
      songs: { include: { song: true } },
    },
  })
  return NextResponse.json({ ok: true, rehearsal })
}

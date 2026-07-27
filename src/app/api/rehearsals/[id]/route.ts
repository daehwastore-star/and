import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseAttendees } from '@/lib/parse'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rehearsal = await prisma.rehearsal.findUnique({
    where: { id },
    include: { attendances: { include: { member: true } } },
  })
  if (!rehearsal) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ rehearsal })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()

  const existing = await prisma.rehearsal.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body.date) {
    const d = new Date(body.date)
    if (!isNaN(d.getTime())) data.date = d
  }
  if (typeof body.hours === 'number' && body.hours > 0) data.hours = Math.round(body.hours)
  if (typeof body.roomCost === 'number') data.roomCost = Math.max(0, Math.round(body.roomCost))
  if (typeof body.afterPartyCost === 'number')
    data.afterPartyCost = Math.max(0, Math.round(body.afterPartyCost))
  if (typeof body.memo === 'string') data.memo = body.memo.trim() || null

  // 참석자 목록이 오면 전체 교체
  if (Array.isArray(body.attendees)) {
    const attendees = parseAttendees(body.attendees)
    if (attendees.length === 0)
      return NextResponse.json({ error: '참석자를 1명 이상 선택해주세요' }, { status: 400 })
    await prisma.attendance.deleteMany({ where: { rehearsalId: id } })
    await prisma.attendance.createMany({
      data: attendees.map(a => ({
        rehearsalId: id,
        memberId: a.memberId,
        late: a.late,
        afterParty: a.afterParty,
      })),
    })
  }

  const rehearsal = await prisma.rehearsal.update({
    where: { id },
    data,
    include: { attendances: { include: { member: true } } },
  })
  return NextResponse.json({ ok: true, rehearsal })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.rehearsal.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

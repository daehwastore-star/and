import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const poll = await prisma.schedulePoll.findUnique({
    where: { id },
    include: {
      options: {
        orderBy: { startsAt: 'asc' },
        include: { votes: { include: { member: true } } },
      },
    },
  })
  if (!poll) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ poll })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: { closed?: boolean; title?: string } = {}
  if (typeof body.closed === 'boolean') data.closed = body.closed
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  const poll = await prisma.schedulePoll.update({ where: { id }, data })
  return NextResponse.json({ ok: true, poll })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.schedulePoll.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

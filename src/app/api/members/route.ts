import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureMembers } from '@/lib/members'

export async function GET() {
  await ensureMembers()
  const members = await prisma.member.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: { wishes: { select: { songId: true } } },
  })
  return NextResponse.json({ members })
}

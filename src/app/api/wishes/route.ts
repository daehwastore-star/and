import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const wishes = await prisma.songWish.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      member: { select: { id: true, name: true, sortOrder: true } },
      song: { select: { id: true, title: true, artist: true, artwork: true } },
    },
  })
  return NextResponse.json({ wishes })
}

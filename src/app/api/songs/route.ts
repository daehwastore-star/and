import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: { createdAt: 'desc' },
    include: { rehearsals: { select: { rehearsalId: true } } },
  })
  return NextResponse.json({ songs })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: '곡 제목을 입력해주세요' }, { status: 400 })

  const song = await prisma.song.create({
    data: {
      title,
      artist: typeof body.artist === 'string' ? body.artist.trim() || null : null,
      link: typeof body.link === 'string' ? body.link.trim() || null : null,
      artwork: typeof body.artwork === 'string' ? body.artwork.trim() || null : null,
    },
  })
  return NextResponse.json({ ok: true, song })
}

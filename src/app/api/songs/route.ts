import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rehearsals: { select: { rehearsalId: true } },
      sheets: { select: { id: true, part: true } },
    },
  })
  return NextResponse.json({ songs })
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: '곡 제목을 입력해주세요' }, { status: 400 })

  const artist = typeof body.artist === 'string' ? body.artist.trim() || null : null
  // repertoire=false 면 위시 전용 희망곡 (프로필에서 추가)
  const inRepertoire = body.repertoire !== false

  // 같은 곡이 이미 있으면 재사용 — 정식 합주곡으로 추가하는 경우 위시 전용 곡을 승격
  const existing = await prisma.song.findFirst({ where: { title, artist } })
  if (existing) {
    const song =
      inRepertoire && !existing.inRepertoire
        ? await prisma.song.update({ where: { id: existing.id }, data: { inRepertoire: true } })
        : existing
    return NextResponse.json({ ok: true, song })
  }

  const song = await prisma.song.create({
    data: {
      title,
      artist,
      link: typeof body.link === 'string' ? body.link.trim() || null : null,
      artwork: typeof body.artwork === 'string' ? body.artwork.trim() || null : null,
      inRepertoire,
    },
  })
  return NextResponse.json({ ok: true, song })
}

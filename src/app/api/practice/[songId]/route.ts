import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const song = await prisma.song.findUnique({
    where: { id: songId },
    select: {
      id: true,
      title: true,
      artist: true,
      artwork: true,
      practice: true,
      stems: { select: { part: true, file: true, createdAt: true } },
      sheets: { select: { id: true, part: true, file: true, filename: true } },
    },
  })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // 악보 데이터는 무거우니 있는지만 알려주고, 필요할 때 /score 로 받는다
  const scored = await prisma.practiceStem.findMany({ where: { songId, score: { not: null } }, select: { part: true } })
  const stems = song.stems.map(s => ({ ...s, hasScore: scored.some(x => x.part === s.part) }))
  return NextResponse.json({ song: { ...song, stems } })
}

// 곡 연습 설정 저장 (템포·박자·카운트인·마디 수)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ songId: string }> }) {
  const { songId } = await params
  const song = await prisma.song.findUnique({ where: { id: songId } })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = await req.json()
  const bpm = Number(b.bpm)
  const bars = Math.round(Number(b.bars))
  const beatsPerBar = Math.round(Number(b.beatsPerBar ?? 4))
  const countInBeats = Math.round(Number(b.countInBeats ?? 4))
  if (!(bpm > 20 && bpm < 400) || !(bars > 0 && bars <= 1000) || !(beatsPerBar > 0 && beatsPerBar <= 16) || !(countInBeats >= 0 && countInBeats <= 16))
    return NextResponse.json({ error: '설정값이 이상해요' }, { status: 400 })
  const data = { bpm, bars, beatsPerBar, countInBeats }
  const practice = await prisma.practiceSong.upsert({ where: { songId }, create: { songId, ...data }, update: data })
  return NextResponse.json({ ok: true, practice })
}

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 연습 탭 목록: 정식 합주곡 + 연습 음원(파트)이 준비된 곡
export async function GET() {
  const songs = await prisma.song.findMany({
    where: { OR: [{ inRepertoire: true }, { practice: { isNot: null } }] },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      artist: true,
      artwork: true,
      inRepertoire: true,
      practice: true,
      stems: { select: { part: true } },
      sheets: { select: { part: true } },
    },
  })
  // 악보(박자 체크용)가 붙은 파트 — 악보 내용은 무거워서 따로 있는지만 본다
  const scored = await prisma.practiceStem.findMany({ where: { score: { not: null } }, select: { songId: true, part: true } })
  return NextResponse.json({
    songs: songs.map(s => ({
      ...s,
      stems: s.stems.map(x => ({ ...x, hasScore: scored.some(y => y.songId === s.id && y.part === x.part) })),
    })),
  })
}

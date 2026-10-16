import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rm } from 'fs/promises'
import { join } from 'path'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const song = await prisma.song.findUnique({
    where: { id },
    include: {
      sheets: { orderBy: { createdAt: 'desc' } },
      tracks: { orderBy: { createdAt: 'asc' } },
      practice: { select: { songId: true } },
    },
  })
  if (!song) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ song })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body.artist === 'string') data.artist = body.artist.trim() || null
  if (typeof body.link === 'string') data.link = body.link.trim() || null
  if (typeof body.inRepertoire === 'boolean') data.inRepertoire = body.inRepertoire
  const song = await prisma.song.update({ where: { id }, data })
  return NextResponse.json({ ok: true, song })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // 곡을 지우면 음원 행은 cascade 로 사라지지만 파일은 남는다 — 먼저 목록을 받아 같이 지운다
  const tracks = await prisma.practiceTrack.findMany({ where: { songId: id }, select: { file: true } })
  const stems = await prisma.practiceStem.findMany({ where: { songId: id }, select: { file: true } })
  await prisma.song.delete({ where: { id } })
  await Promise.all([...tracks, ...stems].map(t => rm(join(process.cwd(), 'uploads', t.file), { force: true })))
  return NextResponse.json({ ok: true })
}

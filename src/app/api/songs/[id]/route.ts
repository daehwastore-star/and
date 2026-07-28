import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const song = await prisma.song.findUnique({
    where: { id },
    include: { sheets: { orderBy: { createdAt: 'desc' } } },
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
  const song = await prisma.song.update({ where: { id }, data })
  return NextResponse.json({ ok: true, song })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.song.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

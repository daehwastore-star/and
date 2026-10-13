import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { rm } from 'fs/promises'
import { join } from 'path'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const track = await prisma.practiceTrack.findUnique({ where: { id } })
  if (!track) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.practiceTrack.delete({ where: { id } })
  // 음원 파일은 커서(곡당 수 MB) 남겨두면 디스크만 차지한다 — 같이 지운다
  await rm(join(process.cwd(), 'uploads', track.file), { force: true })
  return NextResponse.json({ ok: true })
}

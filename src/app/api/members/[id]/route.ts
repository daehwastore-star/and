import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const VALID_ROLES = ['보컬', '드럼', '베이스', '일렉기타', '어쿠스틱기타', '키보드', '매니저']

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (Array.isArray(body.roles)) {
    const roles = body.roles.filter(
      (r: unknown): r is string => typeof r === 'string' && VALID_ROLES.includes(r),
    )
    data.roles = roles.length > 0 ? roles.join(',') : null
  }

  // 합주하고 싶은 곡 위시리스트 (전체 교체)
  if (Array.isArray(body.wishSongIds)) {
    const songIds = body.wishSongIds.filter((s: unknown): s is string => typeof s === 'string')
    await prisma.songWish.deleteMany({ where: { memberId: id } })
    if (songIds.length > 0) {
      const valid = await prisma.song.findMany({
        where: { id: { in: songIds } },
        select: { id: true },
      })
      await prisma.songWish.createMany({
        data: valid.map(s => ({ memberId: id, songId: s.id })),
      })
    }
  }

  const member = await prisma.member.update({ where: { id }, data })
  return NextResponse.json({ ok: true, member })
}

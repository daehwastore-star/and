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

  const member = await prisma.member.update({ where: { id }, data })
  return NextResponse.json({ ok: true, member })
}

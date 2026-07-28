import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// { memberId?, subscription: { endpoint, keys: { p256dh, auth } } }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const sub = body.subscription
  if (
    typeof sub?.endpoint !== 'string' ||
    typeof sub?.keys?.p256dh !== 'string' ||
    typeof sub?.keys?.auth !== 'string'
  ) {
    return NextResponse.json({ error: '잘못된 구독 정보예요' }, { status: 400 })
  }
  const memberId = typeof body.memberId === 'string' && body.memberId ? body.memberId : null

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, memberId },
    update: { p256dh: sub.keys.p256dh, auth: sub.keys.auth, memberId },
  })
  return NextResponse.json({ ok: true })
}

// { endpoint } — 알림 끄기
export async function DELETE(req: NextRequest) {
  const body = await req.json()
  if (typeof body.endpoint === 'string') {
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } })
  }
  return NextResponse.json({ ok: true })
}

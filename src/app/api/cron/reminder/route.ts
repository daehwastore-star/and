import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendPushToAll, getAppConfig, setAppConfig } from '@/lib/push'
import { fmtDateTime } from '@/lib/format'

// 매시간 cron이 호출 → KST 오전 10시에만 실제 발송 (서버 시간대 무관)
// ?force=1 로 테스트 발송 가능
export async function POST(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1'
  const now = new Date()
  const kstHour = Number(
    now.toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }),
  )
  if (!force && kstHour !== 10) {
    return NextResponse.json({ skipped: `KST ${kstHour}시 — 10시에만 발송` })
  }

  // 하루 1회만 발송 (중복 방지)
  const todayKst = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
  const dedupKey = force ? `reminder-forced-${todayKst}-${kstHour}` : `reminder-${todayKst}`
  if (await getAppConfig(dedupKey)) {
    return NextResponse.json({ skipped: '오늘은 이미 발송했어요' })
  }

  // 내일(KST) 일정 조회
  const tomorrowKst = new Date(now.getTime() + 86400000).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Seoul',
  })
  const start = new Date(`${tomorrowKst}T00:00:00+09:00`)
  const end = new Date(start.getTime() + 86400000)
  const events = await prisma.rehearsal.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: { date: 'asc' },
  })

  await setAppConfig(dedupKey, new Date().toISOString())

  if (events.length === 0) {
    return NextResponse.json({ sent: 0, reason: '내일 일정 없음' })
  }

  const first = events[0]
  const isGig = first.type === '공연'
  const title = isGig ? '🎤 내일 공연이에요!' : '🎸 내일 합주예요!'
  const body = events
    .map(e => `${fmtDateTime(e.date)}${e.memo ? ` · ${e.memo}` : ''}`)
    .join('\n')

  const sent = await sendPushToAll({ title, body, url: '/schedule' })
  return NextResponse.json({ sent, events: events.length })
}

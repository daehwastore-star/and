import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDateTime } from '@/lib/format'
import { calcSettlement, won } from '@/lib/settlement'

export const dynamic = 'force-dynamic'

export default async function SettleListPage() {
  const rehearsals = await prisma.rehearsal.findMany({
    orderBy: { date: 'desc' },
    include: { attendances: { include: { member: true } } },
  })

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">💸 정산 기록</h1>
        <Link
          href="/settle/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-black"
        >
          + 새 정산
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        합주비 엔빵 · 지각은 1시간 절반 추가 · 뒤풀이는 참석자끼리
      </p>

      {rehearsals.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
          아직 정산 기록이 없어요.
          <br />합주 끝나면 바로 기록해보세요!
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {rehearsals.map(r => {
            const result = calcSettlement(
              r.roomCost,
              r.hours,
              r.afterPartyCost,
              r.attendances.map(a => ({
                memberId: a.memberId,
                name: a.member.name,
                late: a.late,
                afterParty: a.afterParty,
              })),
            )
            return (
              <Link
                key={r.id}
                href={`/settle/${r.id}`}
                className="block rounded-2xl bg-surface p-4 active:bg-surface-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{fmtDateTime(r.date)}</span>
                  <span className="text-sm text-zinc-400">{r.hours}시간</span>
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  {result.attendeeCount}명 참석
                  {result.lateCount > 0 && ` (지각 ${result.lateCount})`} · 합주비{' '}
                  {won(r.roomCost)}
                  {r.afterPartyCost > 0 &&
                    ` · 뒤풀이 ${won(r.afterPartyCost)} (${result.afterPartyCount}명)`}
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  {r.attendances.map(a => a.member.name).join(', ')}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

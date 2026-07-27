import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getMembers } from '@/lib/members'
import { fmtDateTime } from '@/lib/format'
import { calcSettlement, won } from '@/lib/settlement'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const members = await getMembers()
  const openPolls = await prisma.schedulePoll.findMany({
    where: { closed: false },
    orderBy: { createdAt: 'desc' },
    include: { options: { include: { votes: true } } },
  })
  const recent = await prisma.rehearsal.findMany({
    orderBy: { date: 'desc' },
    take: 3,
    include: { attendances: { include: { member: true } } },
  })

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">
        🎸 밴드 합주 매니저
      </h1>
      <p className="mt-1 text-sm text-zinc-400">
        스케줄 맞추고, 합주비·뒤풀이비 깔끔하게 엔빵
      </p>

      {/* 멤버 */}
      <section className="mt-6 rounded-2xl bg-surface p-4">
        <h2 className="text-sm font-semibold text-zinc-400">멤버</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {members.map(m => (
            <span
              key={m.id}
              className={`rounded-full px-3 py-1 text-sm ${
                m.isGuest
                  ? 'bg-surface-2 text-zinc-400'
                  : 'bg-brand/15 text-brand'
              }`}
            >
              {m.name}
              {m.isGuest && ' (객원)'}
            </span>
          ))}
        </div>
      </section>

      {/* 진행중 투표 */}
      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">진행중인 스케줄 투표</h2>
          <Link href="/schedule/new" className="text-sm text-brand">
            + 새 투표
          </Link>
        </div>
        {openPolls.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
            진행중인 투표가 없어요. 새 투표를 만들어 합주 날짜를 정해보세요!
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {openPolls.map(poll => {
              const voted = new Set(
                poll.options.flatMap(o => o.votes.map(v => v.memberId)),
              )
              return (
                <Link
                  key={poll.id}
                  href={`/schedule/${poll.id}`}
                  className="block rounded-2xl bg-surface p-4 active:bg-surface-2"
                >
                  <div className="font-semibold">{poll.title}</div>
                  <div className="mt-1 text-sm text-zinc-400">
                    후보 {poll.options.length}개 · {voted.size}명 투표 완료
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 최근 정산 */}
      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">최근 합주 정산</h2>
          <Link href="/settle/new" className="text-sm text-brand">
            + 새 정산
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
            아직 정산 기록이 없어요.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {recent.map(r => {
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
                    {result.attendeeCount}명 참석 · 합주비 {won(r.roomCost)}
                    {r.afterPartyCost > 0 && ` · 뒤풀이 ${won(r.afterPartyCost)}`}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 정산 규칙 */}
      <section className="mt-4 rounded-2xl bg-surface p-4 text-sm text-zinc-400">
        <h2 className="font-semibold text-zinc-300">💡 정산 규칙</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>합주비는 참석자 엔빵</li>
          <li>지각한 사람은 1시간 비용의 절반을 추가 부담</li>
          <li>뒤풀이비는 뒤풀이 참석자끼리만 엔빵</li>
        </ul>
      </section>
    </main>
  )
}

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function SchedulePage() {
  const polls = await prisma.schedulePoll.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      options: { orderBy: { startsAt: 'asc' }, include: { votes: true } },
    },
  })

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📅 합주 스케줄</h1>
        <Link
          href="/schedule/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-black"
        >
          + 새 투표
        </Link>
      </div>
      <p className="mt-1 text-sm text-zinc-400">
        후보 날짜를 올리고 다들 되는 시간에 투표해요
      </p>

      {polls.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
          아직 투표가 없어요.
          <br />첫 스케줄 투표를 만들어보세요!
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {polls.map(poll => {
            const voted = new Set(
              poll.options.flatMap(o => o.votes.map(v => v.memberId)),
            )
            const best = poll.options.reduce(
              (acc, o) => {
                const yes = o.votes.filter(v => v.available).length
                return yes > acc.yes ? { option: o, yes } : acc
              },
              { option: null as (typeof poll.options)[number] | null, yes: 0 },
            )
            return (
              <Link
                key={poll.id}
                href={`/schedule/${poll.id}`}
                className="block rounded-2xl bg-surface p-4 active:bg-surface-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{poll.title}</span>
                  {poll.closed && (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-zinc-400">
                      마감
                    </span>
                  )}
                </div>
                <div className="mt-1 text-sm text-zinc-400">
                  후보 {poll.options.length}개 · {voted.size}명 투표
                  {best.option && best.yes > 0 && (
                    <> · 최다 {fmtDateTime(best.option.startsAt)} ({best.yes}명)</>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}

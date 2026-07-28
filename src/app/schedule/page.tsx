import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fmtDateTime, kstDday } from '@/lib/format'
import Calendar from '@/components/Calendar'

export const dynamic = 'force-dynamic'

function ddayLabel(n: number): string {
  if (n === 0) return 'D-DAY'
  if (n > 0) return `D-${n}`
  return `${-n}일 전`
}

export default async function SchedulePage() {
  const rehearsals = await prisma.rehearsal.findMany({
    orderBy: { date: 'asc' },
    include: {
      attendances: { include: { member: true } },
      songs: { include: { song: true } },
    },
  })

  const now = new Date()
  const cutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000) // 당일 합주는 끝나도 당일까진 표시
  const upcoming = rehearsals.filter(r => r.date >= cutoff)
  const past = rehearsals.filter(r => r.date < cutoff).reverse().slice(0, 5)

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📅 합주 일정</h1>
        <Link
          href="/schedule/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          + 새 일정
        </Link>
      </div>

      {/* 다가오는 일정 피드 */}
      <section className="mt-5">
        <h2 className="text-base font-semibold">다가오는 일정</h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
            잡혀있는 합주가 없어요.
            <br />새 일정을 만들어보세요!
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {upcoming.map(r => {
              const d = kstDday(r.date)
              return (
                <Link
                  key={r.id}
                  href={`/settle/${r.id}`}
                  className="block rounded-2xl bg-surface p-4 active:bg-surface-2"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.type === '공연'
                          ? 'bg-rose-500 text-white'
                          : d <= 1
                            ? 'bg-brand text-white'
                            : 'bg-brand/15 text-brand'
                      }`}
                    >
                      {r.type === '공연' ? `🎤 공연 ${ddayLabel(d)}` : ddayLabel(d)}
                    </span>
                    <span className="font-semibold">{fmtDateTime(r.date)}</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {r.hours}시간
                    {r.memo && ` · ${r.memo}`}
                    {r.attendances.length > 0 &&
                      ` · ${r.attendances.map(a => a.member.name).join(', ')}`}
                  </div>
                  {r.songs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.songs.map(rs => (
                        <span
                          key={rs.id}
                          className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-zinc-700"
                        >
                          🎵 {rs.song.title}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 캘린더 */}
      <section className="mt-4">
        <Calendar eventDates={rehearsals.map(r => r.date.toISOString())} />
      </section>

      {/* 지난 합주 */}
      {past.length > 0 && (
        <section className="mt-4">
          <h2 className="text-base font-semibold text-zinc-700">지난 합주</h2>
          <div className="mt-2 space-y-2">
            {past.map(r => (
              <Link
                key={r.id}
                href={`/settle/${r.id}`}
                className="block rounded-2xl bg-surface p-4 text-sm text-zinc-500 active:bg-surface-2"
              >
                {fmtDateTime(r.date)} · {r.hours}시간
                {r.attendances.length > 0 && ` · ${r.attendances.length}명`}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

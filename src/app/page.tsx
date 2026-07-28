import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getMembers } from '@/lib/members'
import { fmtDateTime, kstDday } from '@/lib/format'
import { calcSettlement, won } from '@/lib/settlement'

export const dynamic = 'force-dynamic'

function ddayLabel(n: number): string {
  if (n === 0) return 'D-DAY'
  if (n > 0) return `D-${n}`
  return `${-n}일 전`
}

export default async function Home() {
  const members = await getMembers()
  const now = new Date()
  const cutoff = new Date(now.getTime() - 12 * 60 * 60 * 1000)
  const upcoming = await prisma.rehearsal.findMany({
    where: { date: { gte: cutoff } },
    orderBy: { date: 'asc' },
    take: 3,
    include: {
      attendances: { include: { member: true } },
      songs: { include: { song: true } },
    },
  })
  const recent = await prisma.rehearsal.findMany({
    where: { date: { lt: cutoff } },
    orderBy: { date: 'desc' },
    take: 3,
    include: { attendances: { include: { member: true } } },
  })

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">🎸 밴드 합주 매니저</h1>
      <p className="mt-1 text-sm text-zinc-500">
        합주 일정 잡고, 합주비·뒤풀이비 깔끔하게 엔빵
      </p>

      {/* 다가오는 합주 */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">다가오는 합주</h2>
          <Link href="/schedule/new" className="text-sm text-brand">
            + 새 일정
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
            잡혀있는 합주가 없어요. 새 일정을 만들어보세요!
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
                        d <= 1 ? 'bg-brand text-white' : 'bg-brand/15 text-brand'
                      }`}
                    >
                      {ddayLabel(d)}
                    </span>
                    <span className="font-semibold">{fmtDateTime(r.date)}</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {r.hours}시간
                    {r.memo && ` · ${r.memo}`}
                  </div>
                  {r.attendances.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.attendances.map(a => (
                        <span
                          key={a.id}
                          className="rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                        >
                          {a.member.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.songs.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {r.songs.map(rs => (
                        <div
                          key={rs.id}
                          className="flex items-center gap-2 text-sm text-zinc-700"
                        >
                          {rs.song.artwork ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={rs.song.artwork}
                              alt=""
                              className="h-6 w-6 rounded object-cover"
                            />
                          ) : (
                            <span>🎵</span>
                          )}
                          <span className="truncate">
                            {rs.song.title}
                            {rs.song.artist && (
                              <span className="text-zinc-400"> · {rs.song.artist}</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 멤버 프로필 */}
      <section className="mt-4">
        <h2 className="text-base font-semibold">멤버</h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {members.map(m => (
            <Link
              key={m.id}
              href={`/members/${m.id}`}
              className="flex flex-col items-center rounded-2xl bg-surface p-3 active:bg-surface-2"
            >
              {m.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/photos/${m.photo}`}
                  alt={m.name}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand/10 text-xl font-bold text-brand">
                  {m.name[0]}
                </span>
              )}
              <span className="mt-2 text-sm font-semibold">{m.name}</span>
              <span className="mt-0.5 min-h-4 text-center text-xs text-zinc-500">
                {m.roles ? m.roles.split(',').join(' · ') : '역할 미정'}
              </span>
            </Link>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          프로필을 탭하면 사진과 역할을 바꿀 수 있어요
        </p>
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
                    <span className="text-sm text-zinc-500">{r.hours}시간</span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">
                    {result.attendeeCount}명 참석 · 합주비 {won(r.roomCost)}
                    {r.afterPartyCost > 0 && ` · 뒤풀이 ${won(r.afterPartyCost)}`}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 통계 */}
      <Link
        href="/stats"
        className="mt-4 flex items-center justify-between rounded-2xl bg-surface p-4 active:bg-surface-2"
      >
        <span className="font-semibold">📊 밴드 통계</span>
        <span className="text-sm text-zinc-500">지각왕 · 참석률 · 비용 ›</span>
      </Link>

      {/* 정산 규칙 */}
      <section className="mt-4 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
        <h2 className="font-semibold text-zinc-700">💡 정산 규칙</h2>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>합주비는 참석자 엔빵</li>
          <li>지각한 사람은 1시간 비용의 절반을 추가 부담</li>
          <li>뒤풀이비는 뒤풀이 참석자끼리만 엔빵</li>
        </ul>
      </section>
    </main>
  )
}

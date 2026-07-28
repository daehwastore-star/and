import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getMembers } from '@/lib/members'
import { fmtDateTime, kstDday } from '@/lib/format'
import { partEmoji } from '@/lib/sheets'
import { isVideoFile } from '@/lib/media'
import MyIdentity from '@/components/MyIdentity'

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
  // 공연은 상단 카운트다운 배너에 나오므로 목록에서는 합주만 (중복 방지)
  const upcoming = await prisma.rehearsal.findMany({
    where: { date: { gte: cutoff }, type: '합주' },
    orderBy: { date: 'asc' },
    take: 3,
    include: {
      attendances: { include: { member: true } },
      songs: { include: { song: true } },
    },
  })
  const nextGig = await prisma.rehearsal.findFirst({
    where: { type: '공연', date: { gte: cutoff } },
    orderBy: { date: 'asc' },
  })
  const songs = await prisma.song.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
    include: { sheets: { select: { part: true } } },
  })
  const songTotal = await prisma.song.count()
  const journal = await prisma.journalEntry.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    include: { rehearsal: true },
  })

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">🎸 밴드 합주 매니저</h1>
      <p className="mt-1 text-sm text-zinc-500">
        합주 일정 잡고, 합주비·뒤풀이비 깔끔하게 엔빵
      </p>
      <MyIdentity />

      {/* 공연 카운트다운 */}
      {nextGig && (
        <Link
          href={`/settle/${nextGig.id}`}
          className="mt-5 block rounded-2xl bg-gradient-to-br from-rose-500 to-purple-600 p-5 text-white active:opacity-90"
        >
          <div className="text-sm font-semibold opacity-90">🎤 다음 공연까지</div>
          <div className="mt-1 text-4xl font-extrabold">
            {kstDday(nextGig.date) === 0 ? 'D-DAY!' : `D-${kstDday(nextGig.date)}`}
          </div>
          <div className="mt-2 text-sm opacity-90">
            {fmtDateTime(nextGig.date)}
            {nextGig.memo && ` · ${nextGig.memo}`}
          </div>
        </Link>
      )}

      {/* 다가오는 합주 */}
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">다가오는 일정</h2>
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

      {/* 합주곡 */}
      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">합주곡</h2>
          <Link href="/songs" className="text-sm text-brand">
            전체 보기 ({songTotal}) ›
          </Link>
        </div>
        {songs.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
            아직 등록된 곡이 없어요. 합주곡 탭에서 추가해보세요!
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {songs.map(s => {
              const parts = [...new Set(s.sheets.map(x => x.part))]
              return (
                <Link
                  key={s.id}
                  href={`/songs/${s.id}`}
                  className="flex items-center gap-2.5 rounded-2xl bg-surface p-2.5 active:bg-surface-2"
                >
                  {s.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.artwork}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-2">
                      🎵
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{s.artist}</span>
                    {parts.length > 0 && (
                      <span className="block text-xs">
                        {parts.map(p => (
                          <span key={p}>{partEmoji(p)}</span>
                        ))}
                      </span>
                    )}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 기록 피드 */}
      <section className="mt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">기록</h2>
          <Link href="/journal" className="text-sm text-brand">
            전체 보기 ›
          </Link>
        </div>
        {journal.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-zinc-500">
            아직 기록이 없어요. 기록 탭에서 합주의 순간을 남겨보세요!
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {journal.map(e => (
              <Link
                key={e.id}
                href="/journal"
                className="block overflow-hidden rounded-2xl bg-surface active:bg-surface-2"
              >
                {e.photo &&
                  (isVideoFile(e.photo) ? (
                    <video
                      src={`/api/photos/${e.photo}`}
                      controls
                      playsInline
                      className="max-h-80 w-full bg-black"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/photos/${e.photo}`}
                      alt=""
                      className="max-h-80 w-full object-cover"
                    />
                  ))}
                <div className="p-4">
                  {e.text && <p className="line-clamp-2 whitespace-pre-wrap">{e.text}</p>}
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {e.author && <b className="text-zinc-700">{e.author}</b>}
                    {e.author && ' · '}
                    {e.rehearsal ? `${fmtDateTime(e.rehearsal.date)} 합주` : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

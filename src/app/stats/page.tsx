import { prisma } from '@/lib/prisma'
import { getMembers } from '@/lib/members'
import { won } from '@/lib/settlement'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const members = await getMembers()
  const rehearsals = await prisma.rehearsal.findMany({
    include: { attendances: true, songs: { include: { song: true } } },
  })

  // 참석자가 기록된 합주만 통계 대상
  const held = rehearsals.filter(r => r.attendances.length > 0)

  const lateCount = new Map<string, number>()
  const attendCount = new Map<string, number>()
  for (const r of held) {
    for (const a of r.attendances) {
      attendCount.set(a.memberId, (attendCount.get(a.memberId) ?? 0) + 1)
      if (a.late) lateCount.set(a.memberId, (lateCount.get(a.memberId) ?? 0) + 1)
    }
  }

  const lateRanking = members
    .map(m => ({ name: m.name, count: lateCount.get(m.id) ?? 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)

  const attendance = members
    .map(m => ({ name: m.name, count: attendCount.get(m.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)

  // 비용 합계 (전체 / 이번 달, KST 기준)
  const nowKstMonth = new Date().toLocaleDateString('en-CA', {
    timeZone: 'Asia/Seoul',
  }).slice(0, 7)
  const isThisMonth = (d: Date) =>
    d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7) ===
    nowKstMonth

  const totalRoom = held.reduce((s, r) => s + r.roomCost, 0)
  const totalParty = held.reduce((s, r) => s + r.afterPartyCost, 0)
  const monthRoom = held.filter(r => isThisMonth(r.date)).reduce((s, r) => s + r.roomCost, 0)
  const monthParty = held.filter(r => isThisMonth(r.date)).reduce((s, r) => s + r.afterPartyCost, 0)

  // 곡별 연습 횟수
  const songCount = new Map<string, { title: string; artist: string | null; artwork: string | null; count: number }>()
  for (const r of rehearsals) {
    for (const rs of r.songs) {
      const cur = songCount.get(rs.songId)
      if (cur) cur.count += 1
      else
        songCount.set(rs.songId, {
          title: rs.song.title,
          artist: rs.song.artist,
          artwork: rs.song.artwork,
          count: 1,
        })
    }
  }
  const songRanking = [...songCount.values()].sort((a, b) => b.count - a.count).slice(0, 5)

  const medals = ['🥇', '🥈', '🥉']

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">📊 밴드 통계</h1>
      <p className="mt-1 text-sm text-zinc-500">
        지금까지 합주 {held.length}회 기준
      </p>

      {/* 지각왕 */}
      <section className="mt-5 rounded-2xl bg-surface p-4">
        <h2 className="font-semibold">🏆 지각왕 명예의 전당</h2>
        {lateRanking.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            아직 지각자가 없어요. 훌륭한 밴드…!
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {lateRanking.map((x, i) => (
              <div key={x.name} className="flex items-center justify-between text-sm">
                <span>
                  {medals[i] ?? '·'} {x.name}
                </span>
                <span className="font-semibold text-amber-600">{x.count}회 지각</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 참석률 */}
      <section className="mt-3 rounded-2xl bg-surface p-4">
        <h2 className="font-semibold">✋ 참석 횟수</h2>
        <div className="mt-2 space-y-1.5">
          {attendance.map(x => (
            <div key={x.name} className="flex items-center gap-2 text-sm">
              <span className="w-14 shrink-0">{x.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{
                    width: held.length > 0 ? `${(x.count / held.length) * 100}%` : '0%',
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-zinc-500">
                {x.count}회
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 비용 */}
      <section className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-zinc-500">이번 달 합주비</div>
          <div className="mt-1 font-bold">{won(monthRoom)}</div>
          <div className="text-xs text-zinc-500">뒤풀이 {won(monthParty)}</div>
        </div>
        <div className="rounded-2xl bg-surface p-4">
          <div className="text-xs text-zinc-500">누적 합주비</div>
          <div className="mt-1 font-bold">{won(totalRoom)}</div>
          <div className="text-xs text-zinc-500">뒤풀이 {won(totalParty)}</div>
        </div>
      </section>

      {/* 곡 랭킹 */}
      <section className="mt-3 rounded-2xl bg-surface p-4">
        <h2 className="font-semibold">🎵 많이 연습한 곡</h2>
        {songRanking.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            아직 일정에 연결된 곡이 없어요.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {songRanking.map((s, i) => (
              <div key={s.title} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-center">{medals[i] ?? i + 1}</span>
                {s.artwork ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.artwork} alt="" className="h-8 w-8 rounded object-cover" />
                ) : (
                  <span>🎵</span>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {s.title}
                  {s.artist && <span className="text-zinc-500"> · {s.artist}</span>}
                </span>
                <span className="shrink-0 text-zinc-500">{s.count}회</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

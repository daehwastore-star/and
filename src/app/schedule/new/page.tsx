'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Calendar from '@/components/Calendar'

const HOURS = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]

interface Member {
  id: string
  name: string
  isGuest: boolean
}
interface Song {
  id: string
  title: string
  artist: string | null
  artwork: string | null
}

export default function NewSchedulePage() {
  const router = useRouter()
  const [eventDates, setEventDates] = useState<string[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [songs, setSongs] = useState<Song[]>([])
  const [day, setDay] = useState<string | null>(null)
  const [hour, setHour] = useState<number | null>(null)
  const [minute, setMinute] = useState<0 | 30>(0)
  const [hours, setHours] = useState(2)
  const [memo, setMemo] = useState('')
  const [who, setWho] = useState<Set<string>>(new Set())
  const [songSel, setSongSel] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/rehearsals')
      .then(r => r.json())
      .then(d => setEventDates((d.rehearsals as { date: string }[]).map(r => r.date)))
      .catch(() => {})
    fetch('/api/members')
      .then(r => r.json())
      .then(d => setMembers(d.members))
      .catch(() => {})
    fetch('/api/songs')
      .then(r => r.json())
      .then(d => setSongs(d.songs))
      .catch(() => {})
  }, [])

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  const submit = async () => {
    setError('')
    if (!day) return setError('캘린더에서 날짜를 선택해주세요')
    if (hour === null) return setError('시작 시간을 선택해주세요')
    setSaving(true)
    try {
      const pad = (n: number) => String(n).padStart(2, '0')
      const res = await fetch('/api/rehearsals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: `${day}T${pad(hour)}:${pad(minute)}:00+09:00`,
          hours,
          memo: memo.trim(),
          attendees: [...who].map(memberId => ({ memberId })),
          songIds: [...songSel],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      router.push('/schedule')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
      setSaving(false)
    }
  }

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">새 합주 일정</h1>
      <p className="mt-1 text-sm text-zinc-500">
        캘린더에서 날짜를 탭하고 시간을 골라주세요
      </p>

      <div className="mt-5 space-y-4">
        <Calendar eventDates={eventDates} selected={day} onSelect={setDay} />

        <div>
          <label className="text-sm font-semibold text-zinc-700">시작 시간</label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {HOURS.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHour(h)}
                className={`rounded-xl py-2.5 text-sm ${
                  hour === h
                    ? 'bg-brand font-semibold text-white'
                    : 'bg-surface text-zinc-700'
                }`}
              >
                {h}시
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {([0, 30] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMinute(m)}
                className={`flex-1 rounded-xl py-2 text-sm ${
                  minute === m
                    ? 'bg-brand font-semibold text-white'
                    : 'bg-surface text-zinc-700'
                }`}
              >
                {m === 0 ? '정각' : '30분'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-700">합주 시간</label>
          <div className="mt-1 flex gap-2">
            {[2, 3].map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={`flex-1 rounded-xl py-3 font-semibold ${
                  hours === h ? 'bg-brand text-white' : 'bg-surface text-zinc-700'
                }`}
              >
                {h}시간
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-700">누가 오나요?</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setWho(prev => toggle(prev, m.id))}
                className={`rounded-full px-3.5 py-2 text-sm ${
                  who.has(m.id)
                    ? 'bg-brand font-semibold text-white'
                    : 'bg-surface text-zinc-700'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-700">연습할 곡</label>
          {songs.length === 0 ? (
            <p className="mt-1 rounded-xl bg-surface p-3 text-sm text-zinc-500">
              등록된 곡이 없어요 — 합주곡 탭에서 곡을 먼저 추가해주세요
            </p>
          ) : (
            <div className="mt-1 space-y-1.5">
              {songs.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSongSel(prev => toggle(prev, s.id))}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                    songSel.has(s.id)
                      ? 'bg-brand/15 ring-1 ring-brand/40'
                      : 'bg-surface'
                  }`}
                >
                  {s.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.artwork} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2">
                      🎵
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{s.artist}</span>
                  </span>
                  {songSel.has(s.id) && (
                    <span className="shrink-0 font-bold text-brand">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-700">장소 / 메모</label>
          <input
            type="text"
            value={memo}
            onChange={e => setMemo(e.target.value)}
            placeholder="예: OO합주실 3번방"
            className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {day && hour !== null && (
          <p className="rounded-xl bg-brand/10 px-4 py-3 text-sm font-semibold text-brand">
            {day.replaceAll('-', '. ')} · {hour}시{minute === 30 ? ' 30분' : ''} 시작 ·{' '}
            {hours}시간
            {who.size > 0 && ` · ${who.size}명`}
            {songSel.size > 0 && ` · ${songSel.size}곡`}
          </p>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3.5 font-bold text-white disabled:opacity-50"
        >
          {saving ? '만드는 중…' : '일정 만들기'}
        </button>
      </div>
    </main>
  )
}

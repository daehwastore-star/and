'use client'

import { useEffect, useMemo, useState } from 'react'
import BackButton from '@/components/BackButton'
import { isVideoFile, posterUrl } from '@/lib/media'

interface Entry {
  id: string
  text: string | null
  photo: string | null
  author: string | null
  isPractice: boolean
  createdAt: string
  media: { id: string; file: string; preview: string | null; thumb: string | null }[]
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function kstDay(d: string | Date): string {
  return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

// 해당 주(월요일 시작)의 날짜 목록
function weekDates(offset: number): string[] {
  const today = new Date(kstDay(new Date()))
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// 셋로그 스타일 — 한 주의 연습 인증 영상 모아보기
export default function PracticeWeekPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [offset, setOffset] = useState(0)
  const [playing, setPlaying] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/journal')
      .then(r => r.json())
      .then(d => setEntries((d.entries as Entry[]).filter(e => e.isPractice)))
      .catch(() => {})
  }, [])

  const days = useMemo(() => weekDates(offset), [offset])
  const daySet = useMemo(() => new Set(days), [days])
  const weekEntries = entries.filter(e => daySet.has(kstDay(e.createdAt)))
  const people = new Set(weekEntries.map(e => e.author).filter(Boolean))

  const label =
    offset === 0 ? '이번 주' : offset === -1 ? '지난주' : `${-offset}주 전`

  return (
    <main className="px-4 pt-8">
      <BackButton fallback="/journal" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🔥 연습 모아보기</h1>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset(o => o - 1)}
            className="h-8 w-8 rounded-lg bg-surface text-zinc-500"
          >
            ‹
          </button>
          <span className="min-w-16 text-center text-sm font-semibold">{label}</span>
          <button
            type="button"
            onClick={() => setOffset(o => Math.min(0, o + 1))}
            disabled={offset === 0}
            className="h-8 w-8 rounded-lg bg-surface text-zinc-500 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        {days[0].slice(5).replace('-', '.')} ~ {days[6].slice(5).replace('-', '.')}
        {weekEntries.length > 0 &&
          ` · ${people.size}명이 ${weekEntries.length}개 인증 🔥`}
      </p>

      {weekEntries.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
          이 주에는 연습 인증이 없어요.
          {offset === 0 && (
            <>
              <br />
              기록 탭에서 🔥 연습 인증으로 첫 영상을 올려보세요!
            </>
          )}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {weekEntries.map(e => {
            const files =
              e.media.length > 0 ? e.media.map(m => m.file) : e.photo ? [e.photo] : []
            const video = files.find(isVideoFile)
            const gif = video
              ? e.media.find(m => m.file === video)?.preview ?? null
              : null
            const day = new Date(kstDay(e.createdAt) + 'T00:00:00')
            return (
              <div key={e.id} className="overflow-hidden rounded-2xl bg-surface">
                {video && gif && !playing.has(e.id) ? (
                  <button
                    type="button"
                    className="relative block w-full"
                    onClick={() => setPlaying(prev => new Set(prev).add(e.id))}
                  >
                    {/* GIF 미리보기 (자동 재생) — 탭하면 원본 영상 */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/photos/${gif}`}
                      alt=""
                      className="aspect-[3/4] w-full bg-black object-cover"
                    />
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
                      ▶ 소리 켜기
                    </span>
                  </button>
                ) : video ? (
                  <video
                    src={`/api/photos/${video}`}
                    // GIF 가 없을 때(ffmpeg 실패 등) 여기까지 내려온다 — 정지 썸네일로 받친다
                    poster={posterUrl(e.media, video)}
                    controls
                    playsInline
                    autoPlay={playing.has(e.id)}
                    preload="metadata"
                    className="aspect-[3/4] w-full bg-black object-cover"
                  />
                ) : files[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/photos/${files[0]}`}
                    alt=""
                    className="aspect-[3/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[3/4] w-full items-center justify-center bg-surface-2 text-3xl">
                    🔥
                  </div>
                )}
                <div className="p-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{e.author ?? '익명'}</span>
                    <span className="text-xs text-zinc-500">
                      {WEEKDAYS[day.getDay()]}요일
                    </span>
                  </div>
                  {e.text && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{e.text}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

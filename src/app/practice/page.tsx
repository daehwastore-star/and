'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PARTS, partInfo } from '@/lib/practice/parts'

interface Row {
  id: string
  title: string
  artist: string | null
  artwork: string | null
  inRepertoire: boolean
  practice: { bpm: number; bars: number } | null
  stems: { part: string; hasScore: boolean }[]
  sheets: { part: string }[]
}

// 연습 탭: 튜너 + 곡별 혼자 연습 (파트 골라 같이 틀기, 드럼 박자 체크)
export default function PracticeHome() {
  const [songs, setSongs] = useState<Row[] | null>(null)
  useEffect(() => {
    fetch('/api/practice')
      .then(r => r.json())
      .then(d => setSongs(d.songs))
      .catch(() => setSongs([]))
  }, [])

  const ready = (songs ?? []).filter(s => s.practice && s.stems.length > 0)
  const notYet = (songs ?? []).filter(s => !(s.practice && s.stems.length > 0) && s.inRepertoire)

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">🎧 연습</h1>
      <p className="mt-1 text-sm text-zinc-500">혼자 연습할 때 — 필요한 파트만 골라 틀고 같이 쳐요</p>

      <Link href="/practice/tuner" className="mt-5 flex items-center gap-3 rounded-2xl bg-surface p-4 active:bg-surface-2">
        <span className="text-3xl">🎚️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">튜너</span>
          <span className="block text-xs text-zinc-500">기타·베이스 · 표준 / 하프 스텝 다운 / 드롭 D</span>
        </span>
        <span className="text-zinc-400">›</span>
      </Link>

      <h2 className="mt-6 text-base font-semibold">곡 고르기</h2>
      {songs === null ? (
        <p className="mt-2 text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <div className="mt-2 space-y-2">
          {ready.map(s => (
            <Link key={s.id} href={`/practice/${s.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 active:bg-surface-2">
              <Cover s={s} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{s.title}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {s.artist}
                  {s.practice && ` · ${s.practice.bpm} BPM`}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {PARTS.filter(p => s.stems.some(x => x.part === p.key)).map(p => (
                    <span key={p.key} className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                      {partInfo(p.key).emoji} {partInfo(p.key).label}
                    </span>
                  ))}
                  {s.stems.some(x => x.hasScore) && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">🎙 연주 체크</span>
                  )}
                </span>
              </span>
              <span className="text-zinc-400">›</span>
            </Link>
          ))}
          {notYet.length > 0 && (
            <>
              <p className="pt-3 text-xs text-zinc-500">
                아래 곡들은 악보로 파트별 음원을 만드는 중이에요. 준비되면 위로 올라와요.
              </p>
              {notYet.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 opacity-60">
                  <Cover s={s} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{s.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{s.artist} · 준비 중</span>
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </main>
  )
}

function Cover({ s }: { s: Row }) {
  return s.artwork ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={s.artwork} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xl">🎵</span>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { partEmoji } from '@/lib/sheets'

interface Song {
  id: string
  title: string
  artist: string | null
  link: string | null
  artwork: string | null
  inRepertoire: boolean
  rehearsals: { rehearsalId: string }[]
  sheets: { id: string; part: string }[]
}

interface SearchResult {
  title: string
  artist: string
  artwork: string | null
}

interface Wish {
  id: string
  member: { id: string; name: string; sortOrder: number }
  song: { id: string; title: string; artist: string | null; artwork: string | null }
}

export default function SongsPage() {
  const [songs, setSongs] = useState<Song[]>([])
  const [wishes, setWishes] = useState<Wish[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState('')
  const [manualMode, setManualMode] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualArtist, setManualArtist] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const [res, wishRes] = await Promise.all([
      fetch('/api/songs'),
      fetch('/api/wishes'),
    ])
    const data = await res.json()
    const wishData = await wishRes.json()
    setSongs(data.songs)
    setWishes(wishData.wishes)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // 검색어 입력 → 0.4초 뒤 iTunes 검색
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/songs/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setResults(data.results)
      } finally {
        setSearching(false)
      }
    }, 400)
  }, [query])

  const addSong = async (s: { title: string; artist?: string; artwork?: string | null }) => {
    setAdding(s.title)
    try {
      await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      setQuery('')
      setResults([])
      setManualTitle('')
      setManualArtist('')
      await load()
    } finally {
      setAdding('')
    }
  }

  // 정식 합주곡만 목록에 표시 (위시 전용 희망곡은 아래 위시리스트에만)
  const repertoire = songs.filter(s => s.inRepertoire)
  const registered = new Set(repertoire.map(s => `${s.title}|${s.artist ?? ''}`))

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">🎵 합주곡</h1>
      <p className="mt-1 text-sm text-zinc-500">
        곡을 탭하면 파트별 악보를 올리고 볼 수 있어요
      </p>

      {/* 곡 검색 */}
      <div className="mt-5">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="곡 제목이나 가수로 검색 (예: 체리필터)"
          className="w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
        {searching && <p className="mt-2 text-sm text-zinc-500">검색 중…</p>}
        {results.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            {results.map((r, i) => {
              const dup = registered.has(`${r.title}|${r.artist}`)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={dup || adding === r.title}
                  onClick={() => addSong(r)}
                  className="flex w-full items-center gap-3 border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 active:bg-surface-2 disabled:opacity-40"
                >
                  {r.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.artwork}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-2">
                      🎵
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.title}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {r.artist}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand">
                    {dup ? '추가됨' : '+ 추가'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setManualMode(v => !v)}
          className="mt-2 text-sm text-zinc-500 underline"
        >
          {manualMode ? '직접 입력 닫기' : '검색에 없어요? 직접 입력'}
        </button>
        {manualMode && (
          <div className="mt-2 space-y-2 rounded-2xl bg-surface p-3">
            <input
              type="text"
              value={manualTitle}
              onChange={e => setManualTitle(e.target.value)}
              placeholder="곡 제목"
              className="w-full rounded-xl bg-surface-2 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand"
            />
            <input
              type="text"
              value={manualArtist}
              onChange={e => setManualArtist(e.target.value)}
              placeholder="아티스트 (선택)"
              className="w-full rounded-xl bg-surface-2 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="button"
              disabled={!manualTitle.trim()}
              onClick={() => addSong({ title: manualTitle, artist: manualArtist })}
              className="w-full rounded-xl bg-brand py-2.5 font-semibold text-white disabled:opacity-40"
            >
              추가
            </button>
          </div>
        )}
      </div>

      {/* 등록된 곡 목록 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">
          연습곡 목록 <span className="text-zinc-500">({repertoire.length})</span>
        </h2>
        {repertoire.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
            아직 등록된 곡이 없어요.
            <br />위에서 검색해서 추가해보세요!
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            {repertoire.map(s => {
              const parts = [...new Set(s.sheets.map(x => x.part))]
              return (
                <Link
                  key={s.id}
                  href={`/songs/${s.id}`}
                  className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-0 active:bg-surface-2"
                >
                  {s.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.artwork}
                      alt=""
                      className="h-11 w-11 rounded-lg object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-surface-2">
                      🎵
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {s.artist}
                      {s.rehearsals.length > 0 && ` · 합주 ${s.rehearsals.length}회`}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm">
                    {parts.length > 0 ? (
                      parts.map(p => <span key={p}>{partEmoji(p)}</span>)
                    ) : (
                      <span className="text-xs text-zinc-400">악보 없음</span>
                    )}
                  </span>
                  <span className="shrink-0 text-zinc-400">›</span>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* 위시리스트 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">🙏 합주 위시리스트</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          홈 → 내 프로필에서 하고 싶은 곡을 고를 수 있어요
        </p>
        {wishes.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-5 text-center text-sm text-zinc-500">
            아직 위시리스트가 비어있어요.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {[...new Map(wishes.map(w => [w.member.id, w.member])).values()]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(m => (
                <div key={m.id} className="rounded-2xl bg-surface p-3">
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {wishes
                      .filter(w => w.member.id === m.id)
                      .map(w => (
                        <Link
                          key={w.id}
                          href={`/songs/${w.song.id}`}
                          className="flex items-center gap-1.5 rounded-full bg-brand/10 py-1 pl-1 pr-3 text-xs font-medium text-brand"
                        >
                          {w.song.artwork ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={w.song.artwork}
                              alt=""
                              className="h-5 w-5 rounded-full object-cover"
                            />
                          ) : (
                            <span>🎵</span>
                          )}
                          {w.song.title}
                        </Link>
                      ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </main>
  )
}

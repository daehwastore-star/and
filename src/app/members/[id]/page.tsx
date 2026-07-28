'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['보컬', '드럼', '베이스', '일렉기타', '어쿠스틱기타', '키보드', '매니저']

interface Member {
  id: string
  name: string
  roles: string | null
  photo: string | null
  wishes: { songId: string }[]
}

interface Song {
  id: string
  title: string
  artist: string | null
  artwork: string | null
}

interface SearchResult {
  title: string
  artist: string
  artwork: string | null
}

export default function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [member, setMember] = useState<Member | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [wishSel, setWishSel] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  // 새 희망곡 검색
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [addingTitle, setAddingTitle] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // 검색 결과 → 합주곡에 등록 + 내 위시에 바로 체크
  const addWishSong = async (r: SearchResult) => {
    setAddingTitle(r.title)
    try {
      const res = await fetch('/api/songs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(r),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '추가 실패')
      setSongs(prev => [data.song, ...prev])
      setWishSel(prev => new Set(prev).add(data.song.id))
      setQuery('')
      setResults([])
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가 실패')
    } finally {
      setAddingTitle('')
    }
  }

  const load = useCallback(async () => {
    const [res, songRes] = await Promise.all([
      fetch('/api/members'),
      fetch('/api/songs'),
    ])
    const data = await res.json()
    const songData = await songRes.json()
    const m = (data.members as Member[]).find(x => x.id === id)
    if (!m) {
      setError('멤버를 찾을 수 없어요')
      return
    }
    setMember(m)
    setSongs(songData.songs)
    setRoles(new Set(m.roles ? m.roles.split(',') : []))
    setWishSel(new Set(m.wishes.map(w => w.songId)))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const toggleRole = (r: string) =>
    setRoles(prev => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else next.add(r)
      return next
    })

  const saveRoles = async () => {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/members/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: [...roles], wishSongIds: [...wishSel] }),
      })
      if (!res.ok) throw new Error('저장 실패')
      router.push('/')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
      setSaving(false)
    }
  }

  const uploadPhoto = async (file: File) => {
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('photo', file)
      const res = await fetch(`/api/members/${id}/photo`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '업로드 실패')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }

  if (!member) {
    return (
      <main className="px-4 pt-8">
        <p className="text-zinc-500">{error || '불러오는 중…'}</p>
      </main>
    )
  }

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">{member.name} 프로필</h1>

      {/* 프로필 사진 */}
      <section className="mt-6 flex flex-col items-center">
        {member.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${member.photo}`}
            alt={member.name}
            className="h-32 w-32 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-32 w-32 items-center justify-center rounded-full bg-brand/10 text-4xl font-bold text-brand">
            {member.name[0]}
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) uploadPhoto(f)
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="mt-3 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50"
        >
          {uploading ? '업로드 중…' : member.photo ? '사진 바꾸기' : '사진 올리기'}
        </button>
      </section>

      {/* 역할 선택 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-700">
          담당 역할 <span className="font-normal text-zinc-500">(여러 개 가능)</span>
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {ROLES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              className={`rounded-full px-4 py-2.5 text-sm ${
                roles.has(r)
                  ? 'bg-brand font-semibold text-white'
                  : 'bg-surface text-zinc-700'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      {/* 합주하고 싶은 곡 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-zinc-700">
          🙏 합주하고 싶은 곡{' '}
          <span className="font-normal text-zinc-500">(여러 개 가능)</span>
        </h2>

        {/* 새 희망곡 검색 */}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="🔍 새 희망곡 검색 (예: 체리필터)"
          className="mt-2 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
        />
        {searching && <p className="mt-1 text-xs text-zinc-500">검색 중…</p>}
        {results.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            {results.map((r, i) => {
              const dup = songs.some(s => s.title === r.title && (s.artist ?? '') === r.artist)
              return (
                <button
                  key={i}
                  type="button"
                  disabled={dup || addingTitle === r.title}
                  onClick={() => addWishSong(r)}
                  className="flex w-full items-center gap-3 border-b border-zinc-100 px-3 py-2.5 text-left last:border-0 active:bg-surface-2 disabled:opacity-40"
                >
                  {r.artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.artwork} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2">
                      🎵
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{r.artist}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand">
                    {dup ? '이미 있음' : '+ 희망곡'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {songs.length === 0 ? (
          <p className="mt-2 rounded-xl bg-surface p-3 text-sm text-zinc-500">
            등록된 곡이 없어요 — 합주곡 탭에서 곡을 먼저 추가해주세요
          </p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {songs.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  setWishSel(prev => {
                    const next = new Set(prev)
                    if (next.has(s.id)) next.delete(s.id)
                    else next.add(s.id)
                    return next
                  })
                }
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${
                  wishSel.has(s.id) ? 'bg-brand/15 ring-1 ring-brand/40' : 'bg-surface'
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
                {wishSel.has(s.id) && <span className="shrink-0 font-bold text-brand">🙏</span>}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

      <button
        type="button"
        onClick={saveRoles}
        disabled={saving}
        className="mt-6 w-full rounded-xl bg-brand py-3.5 font-bold text-white disabled:opacity-50"
      >
        {saving ? '저장 중…' : '저장'}
      </button>
    </main>
  )
}

'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SHEET_PARTS, partEmoji } from '@/lib/sheets'
import { fmtDate } from '@/lib/format'

interface Sheet {
  id: string
  part: string
  file: string
  filename: string
  uploader: string | null
  createdAt: string
}
interface Song {
  id: string
  title: string
  artist: string | null
  artwork: string | null
  sheets: Sheet[]
}
interface Member {
  id: string
  name: string
}

export default function SongDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [song, setSong] = useState<Song | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [part, setPart] = useState('')
  const [uploader, setUploader] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [s, m] = await Promise.all([
      fetch(`/api/songs/${id}`).then(x => x.json()),
      fetch('/api/members').then(x => x.json()),
    ])
    if (!s.song) {
      setError('곡을 찾을 수 없어요')
      return
    }
    setSong(s.song)
    setMembers(m.members)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const upload = async () => {
    setError('')
    if (!part) return setError('어떤 파트 악보인지 골라주세요')
    if (!file) return setError('악보 파일(PDF나 사진)을 첨부해주세요')
    setSaving(true)
    try {
      const form = new FormData()
      form.append('part', part)
      form.append('uploader', uploader)
      form.append('file', file)
      const res = await fetch(`/api/songs/${id}/sheets`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '업로드 실패')
      setFile(null)
      setPart('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setSaving(false)
    }
  }

  const removeSheet = async (s: Sheet) => {
    if (!confirm(`${s.part} 악보(${s.filename})를 삭제할까요?`)) return
    await fetch(`/api/sheets/${s.id}`, { method: 'DELETE' })
    await load()
  }

  const removeSong = async () => {
    if (!song) return
    if (!confirm(`"${song.title}" 곡을 삭제할까요? 악보도 함께 삭제돼요.`)) return
    await fetch(`/api/songs/${id}`, { method: 'DELETE' })
    router.push('/songs')
    router.refresh()
  }

  if (!song) {
    return (
      <main className="px-4 pt-8">
        <p className="text-zinc-500">{error || '불러오는 중…'}</p>
      </main>
    )
  }

  return (
    <main className="px-4 pt-8">
      {/* 곡 정보 */}
      <div className="flex items-center gap-4">
        {song.artwork ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.artwork} alt="" className="h-20 w-20 rounded-2xl object-cover" />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-surface text-3xl">
            🎵
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{song.title}</h1>
          <p className="truncate text-sm text-zinc-500">{song.artist}</p>
        </div>
      </div>

      {/* 악보 목록 */}
      <section className="mt-6">
        <h2 className="text-base font-semibold">🎼 악보</h2>
        {song.sheets.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-surface p-5 text-center text-sm text-zinc-500">
            아직 올라온 악보가 없어요.
            <br />아래에서 첫 악보를 올려보세요!
          </p>
        ) : (
          <div className="mt-2 overflow-hidden rounded-2xl bg-surface">
            {song.sheets.map(s => (
              <div
                key={s.id}
                className="flex items-center gap-3 border-b border-zinc-100 px-3 py-2.5 last:border-0"
              >
                <span className="text-xl">{partEmoji(s.part)}</span>
                <a
                  href={`/api/photos/${s.file}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1"
                >
                  <span className="block text-sm font-medium">
                    {s.part} <span className="text-brand">열기 ›</span>
                  </span>
                  <span className="block truncate text-xs text-zinc-500">
                    {s.filename}
                    {s.uploader && ` · ${s.uploader}`} · {fmtDate(s.createdAt)}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => removeSheet(s)}
                  className="shrink-0 px-2 text-sm text-zinc-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 악보 업로드 */}
      <section className="mt-4 space-y-3 rounded-2xl bg-surface p-4">
        <h2 className="text-sm font-semibold text-zinc-700">악보 올리기</h2>

        <div>
          <span className="text-xs text-zinc-500">어떤 파트?</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SHEET_PARTS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPart(prev => (prev === p.key ? '' : p.key))}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  part === p.key
                    ? 'bg-brand font-semibold text-white'
                    : 'bg-surface-2 text-zinc-700'
                }`}
              >
                {p.emoji} {p.key}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="text-xs text-zinc-500">올리는 사람 (선택)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {members.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setUploader(u => (u === m.name ? '' : m.name))}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  uploader === m.name
                    ? 'bg-brand font-semibold text-white'
                    : 'bg-surface-2 text-zinc-700'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-zinc-700">
          📎 {file ? file.name : 'PDF 또는 사진 첨부'}
          <input
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="button"
          onClick={upload}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3 font-bold text-white disabled:opacity-50"
        >
          {saving ? '올리는 중…' : '악보 올리기'}
        </button>
      </section>

      <button
        type="button"
        onClick={removeSong}
        className="mt-4 w-full rounded-xl bg-surface py-3 text-sm text-red-500"
      >
        곡 삭제
      </button>
    </main>
  )
}

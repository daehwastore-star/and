'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmtDateTime, fmtDate } from '@/lib/format'
import { isVideoFile } from '@/lib/media'
import { getMyId } from '@/lib/identity'

interface Entry {
  id: string
  text: string | null
  photo: string | null
  author: string | null
  createdAt: string
  rehearsal: { id: string; date: string } | null
}
interface Rehearsal {
  id: string
  date: string
  memo: string | null
}
interface Member {
  id: string
  name: string
}

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [writing, setWriting] = useState(false)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [rehearsalId, setRehearsalId] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [e, r, m] = await Promise.all([
      fetch('/api/journal').then(x => x.json()),
      fetch('/api/rehearsals').then(x => x.json()),
      fetch('/api/members').then(x => x.json()),
    ])
    setEntries(e.entries)
    setRehearsals(r.rehearsals)
    setMembers(m.members)
    // 기기에 저장된 "나"를 기본 작성자로
    const myId = getMyId()
    if (myId) {
      const me = (m.members as { id: string; name: string }[]).find(x => x.id === myId)
      if (me) setAuthor(prev => prev || me.name)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    setError('')
    if (!text.trim() && !photoFile)
      return setError('사진이나 내용을 하나는 넣어주세요')
    setSaving(true)
    try {
      const form = new FormData()
      form.append('text', text)
      form.append('author', author)
      form.append('rehearsalId', rehearsalId)
      if (photoFile) form.append('photo', photoFile)
      const res = await fetch('/api/journal', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      setText('')
      setPhotoFile(null)
      setRehearsalId('')
      setWriting(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!confirm('이 기록을 삭제할까요?')) return
    await fetch(`/api/journal/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <main className="px-4 pt-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📔 밴드 기록</h1>
        <button
          type="button"
          onClick={() => setWriting(v => !v)}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          {writing ? '닫기' : '+ 기록 남기기'}
        </button>
      </div>
      <p className="mt-1 text-sm text-zinc-500">
        합주 사진과 순간들을 아카이브로
      </p>

      {/* 작성 폼 */}
      {writing && (
        <section className="mt-4 space-y-3 rounded-2xl bg-surface p-4">
          <div>
            <label className="text-sm font-semibold text-zinc-700">어느 합주?</label>
            <select
              value={rehearsalId}
              onChange={e => setRehearsalId(e.target.value)}
              className="mt-1 w-full rounded-xl bg-surface-2 px-3 py-2.5 text-sm outline-none"
            >
              <option value="">일반 기록 (합주 무관)</option>
              {rehearsals.map(r => (
                <option key={r.id} value={r.id}>
                  {fmtDateTime(r.date)}
                  {r.memo ? ` · ${r.memo}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-zinc-700">남기는 사람</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {members.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAuthor(a => (a === m.name ? '' : m.name))}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    author === m.name
                      ? 'bg-brand font-semibold text-white'
                      : 'bg-surface-2 text-zinc-700'
                  }`}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder="오늘 합주 어땠나요? (예: 드디어 후렴 맞췄다!!)"
            className="w-full rounded-xl bg-surface-2 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
          />

          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-zinc-700">
            📷 {photoFile ? photoFile.name : '사진/영상 추가 (선택)'}
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full rounded-xl bg-brand py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? '저장 중…' : '기록 저장'}
          </button>
        </section>
      )}

      {/* 타임라인 */}
      {entries.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
          아직 기록이 없어요.
          <br />첫 합주의 순간을 남겨보세요!
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {entries.map(e => (
            <article key={e.id} className="overflow-hidden rounded-2xl bg-surface">
              {e.photo &&
                (isVideoFile(e.photo) ? (
                  <video
                    src={`/api/photos/${e.photo}`}
                    controls
                    playsInline
                    className="max-h-96 w-full bg-black"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/photos/${e.photo}`}
                    alt=""
                    className="max-h-96 w-full object-cover"
                  />
                ))}
              <div className="p-4">
                {e.text && <p className="whitespace-pre-wrap">{e.text}</p>}
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {e.author && <b className="text-zinc-700">{e.author}</b>}
                    {e.author && ' · '}
                    {e.rehearsal
                      ? `${fmtDateTime(e.rehearsal.date)} 합주`
                      : fmtDate(e.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="text-zinc-400"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  )
}

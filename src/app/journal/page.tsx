'use client'

import { useCallback, useEffect, useState } from 'react'
import { fmtDateTime, fmtDate } from '@/lib/format'
import { isVideoFile } from '@/lib/media'
import { getMyId } from '@/lib/identity'

interface Comment {
  id: string
  author: string | null
  text: string
  createdAt: string
}
interface Entry {
  id: string
  text: string | null
  photo: string | null
  author: string | null
  isPractice: boolean
  createdAt: string
  rehearsal: { id: string; date: string } | null
  media: { id: string; file: string }[]
  comments: Comment[]
  likes: { memberId: string }[]
}
interface Rehearsal {
  id: string
  date: string
  memo: string | null
}
interface Member {
  id: string
  name: string
  roles: string | null
}

export default function JournalPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [rehearsals, setRehearsals] = useState<Rehearsal[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [writing, setWriting] = useState(false)
  const [isPractice, setIsPractice] = useState(false)
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [rehearsalId, setRehearsalId] = useState('')
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
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
    if (!text.trim() && photoFiles.length === 0)
      return setError('사진이나 내용을 하나는 넣어주세요')
    setSaving(true)
    try {
      const form = new FormData()
      form.append('text', text)
      form.append('author', author)
      form.append('rehearsalId', isPractice ? '' : rehearsalId)
      form.append('isPractice', isPractice ? '1' : '0')
      for (const f of photoFiles) form.append('photo', f)
      const res = await fetch('/api/journal', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      setText('')
      setPhotoFiles([])
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

  const toggleLike = async (entryId: string) => {
    const myId = getMyId()
    if (!myId) return
    // 낙관적 업데이트
    setEntries(prev =>
      prev.map(e => {
        if (e.id !== entryId) return e
        const liked = e.likes.some(l => l.memberId === myId)
        return {
          ...e,
          likes: liked
            ? e.likes.filter(l => l.memberId !== myId)
            : [...e.likes, { memberId: myId }],
        }
      }),
    )
    await fetch(`/api/journal/${entryId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: myId }),
    })
  }

  const addComment = async (entryId: string) => {
    const text = (commentDrafts[entryId] ?? '').trim()
    if (!text) return
    setCommentDrafts(prev => ({ ...prev, [entryId]: '' }))
    await fetch(`/api/journal/${entryId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author, text }),
    })
    await load()
  }

  const removeComment = async (commentId: string) => {
    if (!confirm('이 댓글을 삭제할까요?')) return
    await fetch(`/api/journal/comments/${commentId}`, { method: 'DELETE' })
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
          {/* 일반 기록 / 연습 인증 전환 */}
          <div className="flex gap-2">
            {([false, true] as const).map(v => (
              <button
                key={String(v)}
                type="button"
                onClick={() => {
                  setIsPractice(v)
                  setPhotoFiles([])
                }}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
                  isPractice === v
                    ? v
                      ? 'bg-orange-500 text-white'
                      : 'bg-brand text-white'
                    : 'bg-surface-2 text-zinc-600'
                }`}
              >
                {v ? '🔥 연습 인증' : '📔 일반 기록'}
              </button>
            ))}
          </div>

          {!isPractice && (
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
          )}

          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={3}
            placeholder={
              isPractice
                ? '오늘 뭐 연습했나요? (예: 시퍼런 봄 솔로 구간 30번 돌림)'
                : '오늘 합주 어땠나요? (예: 드디어 후렴 맞췄다!!)'
            }
            className="w-full rounded-xl bg-surface-2 px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
          />

          {isPractice ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-orange-500/10 px-4 py-3 text-sm font-semibold text-orange-600">
              📹{' '}
              {photoFiles.length > 0
                ? `영상 촬영됨 ✓ — 탭해서 다시 찍기`
                : '지금 바로 촬영해서 인증 (카메라만 가능)'}
              <input
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={e => setPhotoFiles(Array.from(e.target.files ?? []).slice(0, 1))}
              />
            </label>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm text-zinc-700">
              📷{' '}
              {photoFiles.length > 0
                ? `${photoFiles.length}개 선택됨 — 탭해서 다시 고르기`
                : '사진/영상 추가 (여러 장 가능)'}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={e => setPhotoFiles(Array.from(e.target.files ?? []).slice(0, 10))}
              />
            </label>
          )}

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
              {(() => {
                const files =
                  e.media.length > 0 ? e.media.map(m => m.file) : e.photo ? [e.photo] : []
                if (files.length === 0) return null
                return (
                  <div className={files.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}>
                    {files.map(f =>
                      isVideoFile(f) ? (
                        <video
                          key={f}
                          src={`/api/photos/${f}`}
                          controls
                          playsInline
                          className={`w-full bg-black ${
                            files.length > 1 ? 'col-span-2 max-h-80' : 'max-h-96'
                          }`}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={f}
                          src={`/api/photos/${f}`}
                          alt=""
                          className={
                            files.length > 1
                              ? 'aspect-square w-full object-cover'
                              : 'max-h-96 w-full object-cover'
                          }
                        />
                      ),
                    )}
                  </div>
                )
              })()}
              <div className="p-4">
                {e.isPractice && (
                  <span className="mb-1.5 inline-block rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-bold text-orange-600">
                    🔥 연습 인증
                  </span>
                )}
                {e.text && <p className="whitespace-pre-wrap">{e.text}</p>}
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {e.author && (
                      <b className="text-zinc-700">
                        {e.author}
                        {(() => {
                          const roles = members.find(m => m.name === e.author)?.roles
                          return roles ? `(${roles.split(',').join('·')})` : ''
                        })()}
                      </b>
                    )}
                    {e.author && ' · '}
                    {fmtDate(e.createdAt)} 올림
                    {e.rehearsal && ` · ${fmtDateTime(e.rehearsal.date)} 합주`}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(e.id)}
                    className="text-zinc-400"
                  >
                    삭제
                  </button>
                </div>

                {/* 좋아요 */}
                <div className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3">
                  {(() => {
                    const myId = getMyId()
                    const liked = myId ? e.likes.some(l => l.memberId === myId) : false
                    return (
                      <button
                        type="button"
                        onClick={() => toggleLike(e.id)}
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                          liked
                            ? 'bg-rose-500/10 font-semibold text-rose-500'
                            : 'bg-surface-2 text-zinc-600'
                        }`}
                      >
                        {liked ? '❤️' : '🤍'} {e.likes.length > 0 && e.likes.length}
                      </button>
                    )
                  })()}
                  <span className="text-sm text-zinc-400">💬 {e.comments.length}</span>
                </div>

                {/* 댓글 목록 */}
                {e.comments.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {e.comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2 text-sm">
                        <span className="shrink-0 font-semibold text-zinc-700">
                          {c.author ?? '익명'}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                          {c.text}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeComment(c.id)}
                          className="shrink-0 text-xs text-zinc-300"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* 댓글 입력 */}
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    value={commentDrafts[e.id] ?? ''}
                    onChange={ev =>
                      setCommentDrafts(prev => ({ ...prev, [e.id]: ev.target.value }))
                    }
                    onKeyDown={ev => {
                      if (ev.key === 'Enter') addComment(e.id)
                    }}
                    placeholder="댓글 달기…"
                    className="min-w-0 flex-1 rounded-full bg-surface-2 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => addComment(e.id)}
                    disabled={!(commentDrafts[e.id] ?? '').trim()}
                    className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    등록
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

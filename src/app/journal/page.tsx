'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
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
  media: { id: string; file: string; preview: string | null; thumb: string | null }[]
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
  photo: string | null
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

  const addComment = async (entryId: string, text: string) => {
    if (!text) return
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

      {/* 이번 주 연습 모아보기 배너 */}
      {(() => {
        const kst = (d: string | Date) =>
          new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
        const today = new Date(kst(new Date()))
        const monday = new Date(today)
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
        const week = new Set(
          Array.from({ length: 7 }, (_, i) => {
            const d = new Date(monday)
            d.setDate(monday.getDate() + i)
            return d.toISOString().slice(0, 10)
          }),
        )
        const weekPractice = entries.filter(
          e => e.isPractice && week.has(kst(e.createdAt)),
        )
        const people = new Set(weekPractice.map(e => e.author).filter(Boolean)).size
        return (
          <Link
            href="/journal/practice"
            className="mt-3 flex items-center justify-between rounded-2xl bg-orange-500/10 p-4 active:bg-orange-500/20"
          >
            <span className="font-semibold text-orange-600">
              🔥 이번 주 연습 모아보기
            </span>
            <span className="text-sm text-orange-500">
              {weekPractice.length > 0
                ? `${people}명 · ${weekPractice.length}개 ›`
                : '아직 0개 ›'}
            </span>
          </Link>
        )
      })()}

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

      {/* 인스타그램 스타일 피드 */}
      {entries.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-surface p-6 text-center text-sm text-zinc-500">
          아직 기록이 없어요.
          <br />첫 합주의 순간을 남겨보세요!
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {entries.map(e => (
            <FeedCard
              key={e.id}
              entry={e}
              members={members}
              onLike={() => toggleLike(e.id)}
              onDelete={() => remove(e.id)}
              onAddComment={text => addComment(e.id, text)}
              onRemoveComment={removeComment}
            />
          ))}
        </div>
      )}
    </main>
  )
}

// ─── 인스타그램 스타일 피드 카드 ───

function FeedVideo({
  src,
  preview,
  poster,
}: {
  src: string
  preview: string | null
  poster?: string
}) {
  const [sound, setSound] = useState(false)
  // 소리 켜기 전: GIF(있으면) 또는 무음 자동재생 — 릴스 느낌
  if (!sound && preview) {
    return (
      <button type="button" className="relative block h-full w-full" onClick={() => setSound(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/photos/${preview}`} alt="" className="h-full w-full bg-black object-cover" />
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white">
          🔇 탭해서 소리 켜기
        </span>
      </button>
    )
  }
  return (
    <div className="relative h-full w-full">
      <video
        src={`/api/photos/${src}`}
        muted={!sound}
        autoPlay
        loop={!sound}
        playsInline
        controls={sound}
        // 썸네일이 없으면 모바일에서 검은 네모만 보인다
        poster={poster}
        preload="metadata"
        className="h-full w-full bg-black object-cover"
      />
      {!sound && (
        <button
          type="button"
          onClick={() => setSound(true)}
          className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
        >
          🔇 탭해서 소리 켜기
        </button>
      )}
    </div>
  )
}

function FeedCard({
  entry: e,
  members,
  onLike,
  onDelete,
  onAddComment,
  onRemoveComment,
}: {
  entry: Entry
  members: Member[]
  onLike: () => void
  onDelete: () => void
  onAddComment: (text: string) => void
  onRemoveComment: (id: string) => void
}) {
  const [mediaIdx, setMediaIdx] = useState(0)
  const [showAllComments, setShowAllComments] = useState(false)
  const [draft, setDraft] = useState('')

  const author = members.find(m => m.name === e.author)
  const myId = getMyId()
  const liked = myId ? e.likes.some(l => l.memberId === myId) : false
  const medias =
    e.media.length > 0
      ? e.media
      : e.photo
        ? [{ id: e.photo, file: e.photo, preview: null, thumb: null }]
        : []
  const shownComments = showAllComments ? e.comments : e.comments.slice(-2)

  return (
    <article className="overflow-hidden rounded-2xl bg-surface">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        {author?.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/photos/${author.photo}`}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand">
            {(e.author ?? '?')[0]}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-semibold">
            {e.author ?? '익명'}
            {e.isPractice && (
              <span className="ml-1.5 rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-600">
                🔥 연습 인증
              </span>
            )}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {fmtDate(e.createdAt)}
            {e.rehearsal && ` · ${fmtDateTime(e.rehearsal.date)} 합주`}
          </span>
        </div>
        <button type="button" onClick={onDelete} className="px-1 text-zinc-300">
          ✕
        </button>
      </div>

      {/* 미디어 캐러셀 */}
      {medias.length > 0 && (
        <div className="relative">
          <div
            onScroll={ev => {
              const el = ev.currentTarget
              setMediaIdx(Math.round(el.scrollLeft / el.clientWidth))
            }}
            className="flex snap-x snap-mandatory overflow-x-auto"
          >
            {medias.map(m => (
              <div key={m.id} className="aspect-[4/5] w-full flex-none snap-center">
                {isVideoFile(m.file) ? (
                  <FeedVideo
                    src={m.file}
                    preview={m.preview}
                    poster={m.thumb ? `/api/photos/${m.thumb}` : undefined}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/photos/${m.file}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
          {medias.length > 1 && (
            <>
              <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
                {mediaIdx + 1}/{medias.length}
              </span>
              <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
                {medias.map((m, i) => (
                  <span
                    key={m.id}
                    className={`h-1.5 w-1.5 rounded-full ${
                      i === mediaIdx ? 'bg-white' : 'bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* 액션 바 */}
      <div className="flex items-center gap-3 px-3 pt-2.5">
        <button type="button" onClick={onLike} className="text-2xl leading-none">
          {liked ? '❤️' : '🤍'}
        </button>
        <span className="text-2xl leading-none">💬</span>
        {e.likes.length > 0 && (
          <span className="ml-auto text-sm font-semibold">
            좋아요 {e.likes.length}개
          </span>
        )}
      </div>

      {/* 캡션 */}
      {e.text && (
        <p className="px-3 pt-1.5 text-sm">
          <b>{e.author ?? '익명'}</b> <span className="whitespace-pre-wrap">{e.text}</span>
        </p>
      )}

      {/* 댓글 */}
      <div className="px-3 pb-1 pt-1.5">
        {e.comments.length > 2 && !showAllComments && (
          <button
            type="button"
            onClick={() => setShowAllComments(true)}
            className="text-sm text-zinc-400"
          >
            댓글 {e.comments.length}개 모두 보기
          </button>
        )}
        {shownComments.map(c => (
          <div key={c.id} className="flex items-start gap-1.5 py-0.5 text-sm">
            <span className="min-w-0 flex-1">
              <b>{c.author ?? '익명'}</b>{' '}
              <span className="whitespace-pre-wrap break-words">{c.text}</span>
            </span>
            <button
              type="button"
              onClick={() => onRemoveComment(c.id)}
              className="shrink-0 text-xs text-zinc-300"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* 댓글 입력 */}
      <div className="flex items-center gap-2 border-t border-zinc-100 px-3 py-2">
        <input
          type="text"
          value={draft}
          onChange={ev => setDraft(ev.target.value)}
          onKeyDown={ev => {
            if (ev.key === 'Enter' && draft.trim()) {
              onAddComment(draft.trim())
              setDraft('')
            }
          }}
          placeholder="댓글 달기…"
          className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (draft.trim()) {
              onAddComment(draft.trim())
              setDraft('')
            }
          }}
          disabled={!draft.trim()}
          className="shrink-0 text-sm font-semibold text-brand disabled:opacity-30"
        >
          게시
        </button>
      </div>
    </article>
  )
}

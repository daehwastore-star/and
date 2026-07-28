'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLES = ['보컬', '드럼', '베이스', '일렉기타', '어쿠스틱기타', '키보드', '매니저']

interface Member {
  id: string
  name: string
  roles: string | null
  photo: string | null
}

export default function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [member, setMember] = useState<Member | null>(null)
  const [roles, setRoles] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/members')
    const data = await res.json()
    const m = (data.members as Member[]).find(x => x.id === id)
    if (!m) {
      setError('멤버를 찾을 수 없어요')
      return
    }
    setMember(m)
    setRoles(new Set(m.roles ? m.roles.split(',') : []))
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
        body: JSON.stringify({ roles: [...roles] }),
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

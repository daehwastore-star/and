'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { localInputToKstIso } from '@/lib/format'

export default function NewPollPage() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState<string[]>([''])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setOption = (i: number, v: string) =>
    setOptions(prev => prev.map((o, idx) => (idx === i ? v : o)))

  const submit = async () => {
    setError('')
    const filled = options.filter(o => o)
    if (!title.trim()) return setError('투표 제목을 입력해주세요')
    if (filled.length === 0) return setError('후보 날짜를 1개 이상 추가해주세요')
    setSaving(true)
    try {
      const res = await fetch('/api/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          options: filled.map(localInputToKstIso),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      router.push(`/schedule/${data.poll.id}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
      setSaving(false)
    }
  }

  return (
    <main className="px-4 pt-8">
      <h1 className="text-2xl font-bold">새 스케줄 투표</h1>
      <p className="mt-1 text-sm text-zinc-400">
        후보 날짜/시간을 올리면 멤버들이 가능 여부를 투표해요
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label className="text-sm font-semibold text-zinc-300">투표 제목</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예: 8월 첫째주 합주"
            className="mt-1 w-full rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        <div>
          <label className="text-sm font-semibold text-zinc-300">후보 날짜/시간</label>
          <div className="mt-1 space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="datetime-local"
                  value={opt}
                  onChange={e => setOption(i, e.target.value)}
                  className="flex-1 rounded-xl bg-surface px-4 py-3 text-base outline-none focus:ring-2 focus:ring-brand"
                />
                {options.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setOptions(prev => prev.filter((_, idx) => idx !== i))}
                    className="rounded-xl bg-surface px-3 text-zinc-400"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOptions(prev => [...prev, ''])}
            className="mt-2 w-full rounded-xl border border-dashed border-white/20 py-3 text-sm text-zinc-400"
          >
            + 후보 추가
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="w-full rounded-xl bg-brand py-3.5 font-bold text-black disabled:opacity-50"
        >
          {saving ? '만드는 중…' : '투표 만들기'}
        </button>
      </div>
    </main>
  )
}

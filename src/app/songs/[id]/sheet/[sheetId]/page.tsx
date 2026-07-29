'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import BackButton from '@/components/BackButton'

interface Sheet {
  id: string
  part: string
  file: string
  filename: string
  uploader: string | null
}
interface Song {
  id: string
  title: string
  artist: string | null
  sheets: Sheet[]
}

// 악보 전체화면 뷰어 (플로팅 뒤로가기)
export default function SheetViewerPage({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>
}) {
  const { id, sheetId } = use(params)
  const router = useRouter()
  const [song, setSong] = useState<Song | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/songs/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.song) setError('곡을 찾을 수 없어요')
        else setSong(d.song)
      })
      .catch(() => setError('불러오기 실패'))
  }, [id])

  const sheet = song?.sheets.find(s => s.id === sheetId)

  if (!song || !sheet) {
    return (
      <main className="px-4 pt-8">
        <BackButton fallback={`/songs/${id}`} />
        <p className="text-zinc-500">
          {error || (song ? '악보를 찾을 수 없어요' : '불러오는 중…')}
        </p>
      </main>
    )
  }

  const isPdf = sheet.file.toLowerCase().endsWith('.pdf')
  const fileUrl = `/api/photos/${sheet.file}`

  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-black">
      {isPdf ? (
        <iframe src={fileUrl} className="h-full w-full bg-white" title="악보 PDF" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl} alt="악보" className="w-full" />
      )}

      {/* 플로팅 뒤로가기 */}
      <button
        type="button"
        aria-label="뒤로가기"
        onClick={() => {
          if (window.history.length > 1) router.back()
          else router.push(`/songs/${id}`)
        }}
        className="fixed left-4 top-4 z-50 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-2xl text-white backdrop-blur active:bg-black/80"
      >
        ‹
      </button>

      {/* 곡 정보 플로팅 라벨 */}
      <div className="fixed right-4 top-4 z-50 max-w-[60%] truncate rounded-full bg-black/60 px-3 py-2 text-xs text-white backdrop-blur">
        {song.title} · {sheet.part}
      </div>
    </div>
  )
}

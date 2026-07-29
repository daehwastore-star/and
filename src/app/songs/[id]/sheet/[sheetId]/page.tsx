'use client'

import { use, useEffect, useState } from 'react'
import BackButton from '@/components/BackButton'
import { partEmoji } from '@/lib/sheets'

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

// 앱 안에서 악보 보기 (뒤로가기 유지)
export default function SheetViewerPage({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>
}) {
  const { id, sheetId } = use(params)
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
        <p className="text-zinc-500">{error || (song ? '악보를 찾을 수 없어요' : '불러오는 중…')}</p>
      </main>
    )
  }

  const isPdf = sheet.file.toLowerCase().endsWith('.pdf')
  const fileUrl = `/api/photos/${sheet.file}`

  return (
    <main className="px-4 pt-8">
      <BackButton fallback={`/songs/${id}`} />
      <h1 className="text-lg font-bold">
        {partEmoji(sheet.part)} {song.title} — {sheet.part} 악보
      </h1>
      <p className="mt-0.5 text-xs text-zinc-500">
        {sheet.filename}
        {sheet.uploader && ` · ${sheet.uploader}`}
      </p>

      {isPdf ? (
        <>
          <iframe
            src={fileUrl}
            className="mt-3 h-[72vh] w-full rounded-2xl bg-white"
            title="악보 PDF"
          />
          <a
            href={fileUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block rounded-xl bg-surface py-2.5 text-center text-sm text-brand"
          >
            전체 화면이 필요하면 새 창에서 열기 ↗
          </a>
        </>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl} alt="악보" className="mt-3 w-full rounded-2xl" />
      )}
    </main>
  )
}

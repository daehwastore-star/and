'use client'

import { useEffect, useRef, useState } from 'react'

// PDF를 좌우 스와이프로 한 장씩 넘기는 뷰어
// (iOS PWA에서 iframe PDF가 첫 장만 보이는 문제 해결 + 페이지 단위 넘김)
export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [current, setCurrent] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancelled) return
        setTotal(doc.numPages)
        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''
        const width = container.clientWidth || window.innerWidth
        const dpr = Math.min(window.devicePixelRatio || 1, 2)

        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const base = page.getViewport({ scale: 1 })
          const scale = (width / base.width) * dpr
          const viewport = page.getViewport({ scale })

          // 페이지 한 장 = 화면 한 칸 (가로 스냅), 세로로 길면 그 안에서 스크롤
          const pageDiv = document.createElement('div')
          pageDiv.className = 'h-full w-full flex-none snap-center overflow-y-auto'
          const inner = document.createElement('div')
          inner.className = 'flex min-h-full w-full items-center'
          pageDiv.appendChild(inner)

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.display = 'block'
          canvas.style.background = '#fff'
          inner.appendChild(canvas)
          container.appendChild(pageDiv)

          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
        }
        setStatus('ok')
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="relative h-full w-full">
      {status === 'loading' && (
        <p className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center text-sm text-white/70">
          악보 불러오는 중…
        </p>
      )}
      {status === 'error' && (
        <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 text-center">
          <p className="text-sm text-white/70">악보를 표시하지 못했어요.</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-xl bg-white/10 px-4 py-2 text-sm text-white"
          >
            파일로 열기 ↗
          </a>
        </div>
      )}

      <div
        ref={containerRef}
        onScroll={e => {
          const el = e.currentTarget
          setCurrent(Math.min(total, Math.round(el.scrollLeft / el.clientWidth) + 1))
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      />

      {total > 1 && status === 'ok' && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">
          {current} / {total} · 옆으로 넘기세요
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'

type ViewMode = 'swipe' | 'scroll'

const CLS = {
  swipe: {
    container: 'flex h-full w-full snap-x snap-mandatory overflow-x-auto',
    page: 'h-full w-full flex-none snap-center overflow-y-auto',
    inner: 'flex min-h-full w-full items-center',
  },
  scroll: {
    container: 'block h-full w-full overflow-y-auto',
    page: 'w-full',
    inner: 'block w-full',
  },
} as const

// PDF 악보 뷰어 — 옆으로 한 장씩(swipe) / 아래로 쭉(scroll) 전환 가능
export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [current, setCurrent] = useState(1)
  const [total, setTotal] = useState(0)
  const [mode, setMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'swipe'
    return (localStorage.getItem('sheetViewMode') as ViewMode) || 'swipe'
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // legacy 빌드: 아이폰 사파리 등 구형 브라우저 호환
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
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

          const pageDiv = document.createElement('div')
          const inner = document.createElement('div')
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
      } catch (e) {
        console.error('[PdfViewer]', e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [url])

  // 보기 모드에 따라 레이아웃 클래스 전환 (렌더링 다시 안 함)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.className = CLS[mode].container
    for (const child of Array.from(container.children)) {
      ;(child as HTMLElement).className = CLS[mode].page
      const inner = (child as HTMLElement).firstElementChild as HTMLElement | null
      if (inner) inner.className = CLS[mode].inner
    }
  }, [mode, status])

  const toggleMode = () => {
    const next: ViewMode = mode === 'swipe' ? 'scroll' : 'swipe'
    setMode(next)
    localStorage.setItem('sheetViewMode', next)
  }

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
          if (mode !== 'swipe') return
          const el = e.currentTarget
          setCurrent(Math.min(total, Math.round(el.scrollLeft / el.clientWidth) + 1))
        }}
        className={CLS[mode].container}
      />

      {/* 보기 방식 전환 플로팅 버튼 */}
      {status === 'ok' && (
        <button
          type="button"
          onClick={toggleMode}
          className="fixed right-4 top-4 z-50 rounded-full bg-black/60 px-3.5 py-2.5 text-xs font-semibold text-white backdrop-blur active:bg-black/80"
        >
          {mode === 'swipe' ? '↕ 아래로 보기' : '↔ 한장씩 보기'}
        </button>
      )}

      {/* 페이지 표시 (옆으로 모드에서만) */}
      {mode === 'swipe' && total > 1 && status === 'ok' && (
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold text-white backdrop-blur">
          {current} / {total}
        </div>
      )}
    </div>
  )
}

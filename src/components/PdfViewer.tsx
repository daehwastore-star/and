'use client'

import { useEffect, useRef, useState } from 'react'

// PDF를 페이지별 캔버스로 렌더링 (iOS PWA에서 iframe PDF가 첫 장만 보이는 문제 해결)
export default function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [pageInfo, setPageInfo] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url }).promise
        if (cancelled) return
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
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.display = 'block'
          canvas.style.background = '#fff'
          container.appendChild(canvas)
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvas, canvasContext: ctx, viewport }).promise
          setPageInfo(`${i}/${doc.numPages}`)
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
    <div className="min-h-full w-full">
      {status === 'loading' && (
        <p className="p-8 text-center text-sm text-white/70">
          악보 불러오는 중… {pageInfo}
        </p>
      )}
      {status === 'error' && (
        <div className="p-8 text-center">
          <p className="text-sm text-white/70">악보를 표시하지 못했어요.</p>
          <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-xl bg-white/10 px-4 py-2 text-sm text-white">
            파일로 열기 ↗
          </a>
        </div>
      )}
      <div ref={containerRef} className="w-full" />
    </div>
  )
}

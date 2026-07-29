'use client'

import { useRouter } from 'next/navigation'

// 상세 페이지 상단 뒤로가기 (PWA 앱 모드엔 브라우저 뒤로가기가 없음)
export default function BackButton({ fallback = '/' }: { fallback?: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back()
        else router.push(fallback)
      }}
      className="mb-3 flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-sm text-zinc-600 active:bg-surface-2"
    >
      ‹ 뒤로
    </button>
  )
}

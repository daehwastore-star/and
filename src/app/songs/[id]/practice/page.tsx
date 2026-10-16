'use client'

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'

// 예전 주소(곡 → 드럼 박자 체크) → 연습 탭의 곡 화면으로
export default function OldPracticeRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  useEffect(() => {
    router.replace(`/practice/${id}`)
  }, [id, router])
  return null
}

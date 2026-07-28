'use client'

import { useState } from 'react'

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          alert('복사에 실패했어요')
        }
      }}
      className="shrink-0 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700"
    >
      {copied ? '✓ 복사됨' : '복사'}
    </button>
  )
}

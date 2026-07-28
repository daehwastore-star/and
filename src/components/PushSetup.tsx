'use client'

import { useEffect, useState } from 'react'
import { getMyId } from '@/lib/identity'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

type Status = 'checking' | 'unsupported' | 'ios-not-installed' | 'off' | 'on'

// 합주 전날 리마인더 알림 구독 버튼
export default function PushSetup() {
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const init = async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // 아이폰 사파리(미설치)면 홈 화면 추가 안내
        const isIos = /iphone|ipad/i.test(navigator.userAgent)
        const standalone =
          window.matchMedia('(display-mode: standalone)').matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true
        setStatus(isIos && !standalone ? 'ios-not-installed' : 'unsupported')
        return
      }
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const sub = await reg.pushManager.getSubscription()
        setStatus(sub ? 'on' : 'off')
      } catch {
        setStatus('unsupported')
      }
    }
    init()
  }, [])

  const enable = async () => {
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        alert('알림이 차단되어 있어요. 설정에서 허용해주세요!')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const { publicKey } = await fetch('/api/push/key').then(r => r.json())
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: getMyId(), subscription: sub.toJSON() }),
      })
      setStatus('on')
    } catch {
      alert('알림 설정에 실패했어요. 다시 시도해주세요!')
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      setStatus('off')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'checking' || status === 'unsupported') return null

  if (status === 'ios-not-installed') {
    return (
      <p className="mt-3 rounded-xl bg-surface px-4 py-2.5 text-xs text-zinc-500">
        🔔 합주 전날 알림을 받으려면 이 사이트를 <b>홈 화면에 추가</b>한 뒤 앱에서
        알림을 켜주세요 (공유 ⬆️ → 홈 화면에 추가)
      </p>
    )
  }

  if (status === 'off') {
    return (
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="mt-3 w-full rounded-xl bg-brand/10 py-3 text-sm font-semibold text-brand disabled:opacity-50"
      >
        {busy ? '설정 중…' : '🔔 합주 전날 알림 받기'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={disable}
      disabled={busy}
      className="mt-3 w-full rounded-xl bg-surface py-2.5 text-xs text-zinc-500 disabled:opacity-50"
    >
      🔔 합주 전날 알림 켜짐 · 탭해서 끄기
    </button>
  )
}

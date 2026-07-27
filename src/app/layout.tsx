import type { Metadata, Viewport } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: '밴드 합주 매니저',
  description: '합주 스케줄 맞추기 · 합주비/뒤풀이 정산',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f0f13',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh antialiased">
        <div className="mx-auto max-w-lg pb-24">{children}</div>
        <BottomNav />
      </body>
    </html>
  )
}

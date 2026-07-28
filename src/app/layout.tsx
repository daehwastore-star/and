import type { Metadata, Viewport } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: '밴드 합주 매니저',
  description: '합주 스케줄 맞추기 · 합주비/뒤풀이 정산',
  applicationName: '밴드매니저',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true, // iOS 홈화면 추가 시 풀스크린 앱 모드
    title: '밴드매니저',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f6f6f8',
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

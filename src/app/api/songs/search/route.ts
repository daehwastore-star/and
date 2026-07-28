import { NextRequest, NextResponse } from 'next/server'

// iTunes Search API 프록시 (무료, 키 불필요)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q) return NextResponse.json({ results: [] })

  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=KR&media=music&entity=song&limit=12`,
      { signal: AbortSignal.timeout(8000) },
    )
    const data = await res.json()
    const results = (data.results ?? []).map(
      (r: { trackName: string; artistName: string; artworkUrl100?: string }) => ({
        title: r.trackName,
        artist: r.artistName,
        artwork: r.artworkUrl100 ?? null,
      }),
    )
    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ results: [], error: '검색 실패 — 직접 입력해주세요' })
  }
}

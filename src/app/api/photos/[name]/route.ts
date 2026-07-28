import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join, basename, extname } from 'path'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const safe = basename(name) // 경로 탈출 방지
  try {
    const buf = await readFile(join(process.cwd(), 'uploads', safe))
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': MIME[extname(safe).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}

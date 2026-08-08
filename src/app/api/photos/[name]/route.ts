import { NextRequest, NextResponse } from 'next/server'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { join, basename, extname } from 'path'

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.pdf': 'application/pdf', // 악보 파일
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
}

// 영상은 브라우저가 파일을 통째로 받지 않는다. "앞에서 몇 바이트만 주세요" 하고
// 조금씩 끊어 달라고 한다(Range 요청). 사파리·아이폰은 이걸 못 받아주는 주소면
// 아예 재생을 거부한다 — 예전에 파일을 통째로 200 으로만 돌려줘서 영상이 안 나왔다.
//
// 그래서 두 가지를 지킨다.
//  1) Range 를 달라고 하면 그 구간만 206 으로 준다.
//  2) 파일을 메모리에 통째로 올리지 않고 디스크에서 흘려보낸다.
//     200MB 영상을 통째로 읽으면 램 3.8GB 짜리 이 서버가 휘청인다.
function fileResponse(
  path: string,
  size: number,
  type: string,
  range: { start: number; end: number } | null,
) {
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=86400',
    // 이 주소는 구간 요청을 받는다고 알린다. 이게 없으면 브라우저는 시도조차 안 한다.
    'Accept-Ranges': 'bytes',
  }
  const stream = createReadStream(path, range ? { start: range.start, end: range.end } : undefined)
  const body = Readable.toWeb(stream) as unknown as ReadableStream

  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['Content-Length'] = String(range.end - range.start + 1)
    return new Response(body, { status: 206, headers })
  }
  headers['Content-Length'] = String(size)
  return new Response(body, { status: 200, headers })
}

// "bytes=0-1023" / "bytes=500-" / "bytes=-500" 을 읽는다.
//  · 알아볼 수 있는 구간이면  → {start, end}
//  · 파일 밖을 가리키면       → 'unsatisfiable' (416 으로 알려준다)
//  · 그 밖에 못 알아먹겠으면  → null (따지지 말고 전체를 보낸다)
// 마지막 갈래를 넉넉하게 두는 이유: 흔치 않은 형식(여러 구간 요청 등)까지
// 416 으로 거절하면, 고치려던 '영상이 안 나온다' 를 다른 모양으로 되풀이하게 된다.
type Range = { start: number; end: number }
function parseRange(header: string | null, size: number): Range | 'unsatisfiable' | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, rawStart, rawEnd] = m
  let start: number
  let end: number
  if (rawStart === '') {
    if (rawEnd === '') return null // "bytes=-" — 무의미
    start = Math.max(0, size - Number(rawEnd)) // 뒤에서 N 바이트
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start >= size || start > end) return 'unsatisfiable'
  return { start, end }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const safe = basename(name) // 경로 탈출 방지
  const path = join(process.cwd(), 'uploads', safe)

  let size: number
  try {
    const info = await stat(path)
    if (!info.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    size = info.size
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const type = MIME[extname(safe).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(req.headers.get('range'), size)

  // 파일 밖을 달라고 하면 "그런 구간은 없다" 고 알려준다
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' },
    })
  }

  return fileResponse(path, size, type, range)
}

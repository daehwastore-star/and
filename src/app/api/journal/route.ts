import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { writeFile, mkdir } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { makeGifPreview, makeVideoThumb } from '@/lib/videoPreview'

const ALLOWED_EXT = [
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', // 사진
  '.mp4', '.mov', '.webm', '.m4v', // 영상
]
const MAX_FILES = 10

export async function GET() {
  const entries = await prisma.journalEntry.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      rehearsal: true,
      media: { orderBy: { createdAt: 'asc' } },
      comments: { orderBy: { createdAt: 'asc' } },
      likes: { select: { memberId: true } },
    },
  })
  return NextResponse.json({ entries })
}

// FormData: text?, author?, rehearsalId?, photo?(File, 여러 개 가능)
export async function POST(req: NextRequest) {
  const form = await req.formData()
  const text = String(form.get('text') ?? '').trim() || null
  const author = String(form.get('author') ?? '').trim() || null
  const rehearsalId = String(form.get('rehearsalId') ?? '').trim() || null
  const isPractice = String(form.get('isPractice') ?? '') === '1'

  const files = form
    .getAll('photo')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_FILES)

  // 연습 인증은 현장 촬영 영상 필수
  if (isPractice) {
    const VIDEO = ['.mp4', '.mov', '.webm', '.m4v']
    const hasVideo = files.some(f => VIDEO.includes(extname(f.name).toLowerCase()))
    if (!hasVideo)
      return NextResponse.json(
        { error: '연습 인증은 지금 촬영한 영상이 필요해요 📹' },
        { status: 400 },
      )
  }

  const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.m4v']

  // ── 저장하기 전에 전부 검사한다 ──
  // 예전엔 한 장씩 "검사 → 저장" 을 반복했다. 그러면 세 번째 파일이 퇴짜를 맞을 때
  // 앞의 두 장은 이미 디스크에 쓰인 뒤라, 글은 안 만들어졌는데 파일만 주인 없이 남았다
  // (2026-08-08 uploads 에 고아 파일 6개 11MB 발견). 하나라도 걸리면 아무것도 쓰지 않는다.
  const incoming = files.map(f => ({ file: f, ext: extname(f.name).toLowerCase() || '.jpg' }))
  for (const { file, ext } of incoming) {
    if (file.size > 200 * 1024 * 1024)
      return NextResponse.json({ error: '200MB 이하 파일만 올릴 수 있어요' }, { status: 400 })
    if (!ALLOWED_EXT.includes(ext))
      return NextResponse.json({ error: '사진이나 영상 파일만 올릴 수 있어요' }, { status: 400 })
  }
  if (!text && incoming.length === 0)
    return NextResponse.json({ error: '사진이나 내용을 하나는 넣어주세요' }, { status: 400 })

  const saved: { file: string; preview: string | null; thumb: string | null }[] = []
  for (const { file, ext } of incoming) {
    const dir = join(process.cwd(), 'uploads')
    await mkdir(dir, { recursive: true })
    const name = `${randomUUID()}${ext}`
    await writeFile(join(dir, name), Buffer.from(await file.arrayBuffer()))
    // 영상은 정지 썸네일 + 앞 3초 GIF 를 뽑는다 (실패해도 업로드는 계속).
    // ffmpeg 을 한 번에 하나씩 돌린다 — 한 글에 영상이 여러 개면 동시에 띄웠다가
    // 서버가 휘청인다(web·admin 빌드와 같은 기계를 쓴다).
    const isVideo = VIDEO_EXTS.includes(ext)
    const thumb = isVideo ? await makeVideoThumb(name) : null
    const preview = isVideo ? await makeGifPreview(name) : null
    saved.push({ file: name, preview, thumb })
  }

  // rehearsalId 유효성 확인 (없으면 null로 저장)
  const rehearsal = rehearsalId
    ? await prisma.rehearsal.findUnique({ where: { id: rehearsalId } })
    : null

  const entry = await prisma.journalEntry.create({
    data: {
      text,
      author,
      isPractice,
      photo: saved[0]?.file ?? null, // 대표 미디어 (하위 호환)
      rehearsalId: rehearsal?.id ?? null,
      media: { create: saved.map(s => ({ file: s.file, preview: s.preview, thumb: s.thumb })) },
    },
    include: { rehearsal: true, media: true },
  })
  return NextResponse.json({ ok: true, entry })
}

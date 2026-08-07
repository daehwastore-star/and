import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// 댓글 작성: { author?, text }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  const author = typeof body.author === 'string' ? body.author.trim() || null : null
  if (!text) return NextResponse.json({ error: '댓글 내용을 입력해주세요' }, { status: 400 })

  const entry = await prisma.journalEntry.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const comment = await prisma.journalComment.create({
    data: { entryId: id, author, text },
  })
  return NextResponse.json({ ok: true, comment })
}

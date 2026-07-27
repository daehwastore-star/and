import { prisma } from '@/lib/prisma'

// 초기 멤버 자동 등록 (DB 비어있을 때 1회)
const DEFAULT_MEMBERS: { name: string; isGuest: boolean }[] = [
  { name: '최예설', isGuest: false },
  { name: '김태형', isGuest: false },
  { name: '김병석', isGuest: false },
  { name: '안진영', isGuest: false },
  { name: '강폴', isGuest: false },
  { name: '장효주', isGuest: true }, // 객원
]

export async function ensureMembers() {
  const count = await prisma.member.count()
  if (count > 0) return
  await prisma.member.createMany({
    data: DEFAULT_MEMBERS.map((m, i) => ({ ...m, sortOrder: i })),
  })
}

export async function getMembers() {
  await ensureMembers()
  return prisma.member.findMany({
    where: { active: true },
    orderBy: [{ isGuest: 'asc' }, { sortOrder: 'asc' }],
  })
}

import { prisma } from '@/lib/prisma'

// 초기 멤버 자동 등록 (DB 비어있을 때 1회)
const DEFAULT_MEMBERS: string[] = [
  '최예설',
  '김태형',
  '김병석',
  '안진영',
  '강폴',
  '장효주',
]

export async function ensureMembers() {
  const count = await prisma.member.count()
  if (count === 0) {
    await prisma.member.createMany({
      data: DEFAULT_MEMBERS.map((name, i) => ({ name, sortOrder: i })),
    })
    return
  }
  // 과거에 객원으로 등록된 멤버는 일반 멤버로 전환 (전원 동일 대우)
  await prisma.member.updateMany({
    where: { isGuest: true },
    data: { isGuest: false },
  })
}

export async function getMembers() {
  await ensureMembers()
  return prisma.member.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })
}

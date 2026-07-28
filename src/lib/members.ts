import { prisma } from '@/lib/prisma'

// 초기 멤버 자동 등록 (DB 비어있을 때 1회)
const DEFAULT_MEMBERS: { name: string; roles?: string }[] = [
  { name: '최예설' },
  { name: '김태형' },
  { name: '김병석' },
  { name: '안진영' },
  { name: '강폴' },
  { name: '장효주' },
  { name: '홍지효', roles: '매니저' },
]

export async function ensureMembers() {
  const count = await prisma.member.count()
  if (count === 0) {
    await prisma.member.createMany({
      data: DEFAULT_MEMBERS.map((m, i) => ({
        name: m.name,
        roles: m.roles ?? null,
        sortOrder: i,
      })),
    })
    return
  }
  // 과거에 객원으로 등록된 멤버는 일반 멤버로 전환 (전원 동일 대우)
  await prisma.member.updateMany({
    where: { isGuest: true },
    data: { isGuest: false },
  })
  // 나중에 합류한 멤버는 기존 DB에도 추가
  await prisma.member.upsert({
    where: { name: '홍지효' },
    create: { name: '홍지효', roles: '매니저', sortOrder: 6 },
    update: {},
  })
}

export async function getMembers() {
  await ensureMembers()
  return prisma.member.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })
}

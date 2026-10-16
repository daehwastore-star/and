import { BIG_MS, GOOD_MS } from '@/lib/practice/analysis'

// 빨리 = 빨강, 늦게 = 파랑, 정확 = 초록, 놓침 = 회색
export const C = {
  good: '#10b981',
  early: '#ef4444',
  earlyBig: '#b91c1c',
  late: '#3b82f6',
  lateBig: '#1d4ed8',
  missed: '#a1a1aa',
}

/** 오차(ms, 기준 반영된 값) → 색 */
export function devColor(d: number | null): string {
  if (d === null) return C.missed
  if (d < -BIG_MS) return C.earlyBig
  if (d < -GOOD_MS) return C.early
  if (d > BIG_MS) return C.lateBig
  if (d > GOOD_MS) return C.late
  return C.good
}

/** "+12ms 늦게" / "8ms 빨리" / "정확" */
export function devLabel(d: number | null): string {
  if (d === null) return '놓침'
  const r = Math.round(d)
  if (Math.abs(r) <= GOOD_MS) return r === 0 ? '딱 맞음' : `${Math.abs(r)}ms ${r < 0 ? '빨리' : '늦게'} · 정확`
  return `${Math.abs(r)}ms ${r < 0 ? '빨리' : '늦게'}`
}

export function signed(d: number): string {
  const r = Math.round(d)
  return r > 0 ? `+${r}` : `${r}`
}

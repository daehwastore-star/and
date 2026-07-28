// 이 기기에서 "나는 누구" 저장 (첫 진입 시 1회 선택)
const KEY = 'band.memberId'

export function getMyId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(KEY)
}

export function setMyId(id: string) {
  localStorage.setItem(KEY, id)
}

export function clearMyId() {
  localStorage.removeItem(KEY)
}

// 한국 시간 기준 날짜 표시 (서버/클라이언트 어디서 렌더해도 동일)
const KST = 'Asia/Seoul'

export function fmtDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('ko-KR', {
    timeZone: KST,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fmtDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })
}

// 오늘(KST) 기준 D-day 계산: 0=오늘, 1=내일, 음수=지남
export function kstDday(d: Date | string): number {
  const toUtcMidnight = (x: Date) =>
    new Date(x.toLocaleDateString('en-CA', { timeZone: KST })).getTime()
  const target = typeof d === 'string' ? new Date(d) : d
  return Math.round((toUtcMidnight(target) - toUtcMidnight(new Date())) / 86400000)
}

// datetime-local 입력값("2026-08-01T19:00")을 KST로 고정해 ISO 문자열로
export function localInputToKstIso(v: string): string {
  return `${v}:00+09:00`
}

// Date → datetime-local 입력값 (KST 기준)
export function dateToLocalInput(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 16)
}

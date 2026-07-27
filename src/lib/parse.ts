export interface AttendeeBody {
  memberId: string
  late: boolean
  afterParty: boolean
}

// 요청 body의 attendees 배열을 안전하게 파싱
export function parseAttendees(raw: unknown): AttendeeBody[] {
  if (!Array.isArray(raw)) return []
  const out: AttendeeBody[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const rec = item as Record<string, unknown>
    if (typeof rec.memberId !== 'string') continue
    out.push({
      memberId: rec.memberId,
      late: Boolean(rec.late),
      afterParty: Boolean(rec.afterParty),
    })
  }
  return out
}

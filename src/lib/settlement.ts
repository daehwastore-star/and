// 정산 규칙
// - 합주비: 참석자 엔빵. 지각자는 "1시간 비용의 절반"을 추가 부담하고,
//   그만큼을 뺀 나머지를 전원이 똑같이 나눔.
// - 뒤풀이비: 뒤풀이 참석자끼리만 엔빵.
// - 금액은 1원 단위 올림 → 걷은 돈이 모자라지 않게.

export interface AttendeeInput {
  memberId: string
  name: string
  late: boolean
  afterParty: boolean
}

export interface MemberShare {
  memberId: string
  name: string
  late: boolean
  afterParty: boolean
  rehearsalShare: number // 합주비 기본 몫
  latePenalty: number    // 지각 추가 부담
  afterPartyShare: number
  total: number
}

export interface SettlementResult {
  attendeeCount: number
  lateCount: number
  afterPartyCount: number
  hourlyRate: number
  latePenaltyEach: number
  shares: MemberShare[]
  collectedTotal: number
}

export function calcSettlement(
  roomCost: number,
  hours: number,
  afterPartyCost: number,
  attendees: AttendeeInput[],
): SettlementResult {
  const n = attendees.length
  const hourlyRate = hours > 0 ? Math.round(roomCost / hours) : 0
  const latePenaltyEach = Math.round(hourlyRate / 2)
  const lateCount = attendees.filter(a => a.late).length
  const afterPartyCount = attendees.filter(a => a.afterParty).length

  // 지각 부담금을 뺀 나머지를 전원 엔빵 (음수 방지)
  const pool = Math.max(0, roomCost - latePenaltyEach * lateCount)
  const baseShare = n > 0 ? Math.ceil(pool / n) : 0
  const partyShare = afterPartyCount > 0 ? Math.ceil(afterPartyCost / afterPartyCount) : 0

  const shares: MemberShare[] = attendees.map(a => {
    const latePenalty = a.late ? latePenaltyEach : 0
    const afterPartyShare = a.afterParty ? partyShare : 0
    return {
      memberId: a.memberId,
      name: a.name,
      late: a.late,
      afterParty: a.afterParty,
      rehearsalShare: baseShare,
      latePenalty,
      afterPartyShare,
      total: baseShare + latePenalty + afterPartyShare,
    }
  })

  return {
    attendeeCount: n,
    lateCount,
    afterPartyCount,
    hourlyRate,
    latePenaltyEach,
    shares,
    collectedTotal: shares.reduce((s, x) => s + x.total, 0),
  }
}

export function won(n: number): string {
  return n.toLocaleString('ko-KR') + '원'
}

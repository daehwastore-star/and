// 서버에서 받은 악보 데이터가 앱이 읽을 수 있는 모양인지 (크기·형식만 빠르게)
export function validScore(json: string): boolean {
  if (json.length > 800_000) return false
  try {
    const o = JSON.parse(json)
    if (o.type === 'drums') return Array.isArray(o.e) && o.e.every((r: unknown[]) => typeof r[0] === 'number' && typeof r[1] === 'string')
    if (o.type === 'pitched')
      return (
        ['treble', 'treble8', 'bass', 'grand'].includes(o.clef) &&
        Array.isArray(o.e) &&
        o.e.every((r: unknown[]) => typeof r[0] === 'number' && typeof r[1] === 'number' && typeof r[2] === 'number')
      )
  } catch {}
  return false
}

// 실시간 표시용 타격 찾기를 화면 스레드 밖에서 — 폰에서 진행선·스크롤이 끊기지 않게
import { detectOnsets, type BleedInfo } from './analysis'

interface Req {
  id: number
  samples: Float32Array
  sampleRate: number
  reference?: Float32Array
  referenceLag?: number | null
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage: (m: unknown) => void }

ctx.onmessage = async e => {
  const { id, samples, sampleRate, reference, referenceLag } = e.data
  let bleed: BleedInfo | null = null
  try {
    const onsets = await detectOnsets(samples, sampleRate, { reference, referenceLag, onBleed: b => (bleed = b) })
    ctx.postMessage({ id, onsets, bleed })
  } catch (err) {
    ctx.postMessage({ id, error: String(err) })
  }
}

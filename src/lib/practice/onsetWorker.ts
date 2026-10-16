'use client'

// onset.worker.ts 를 부르는 쪽. 워커를 못 쓰는 브라우저면 화면 스레드에서 그냥 한다.
import { detectOnsets, type BleedInfo, type Onset } from './analysis'

interface Res {
  id: number
  onsets?: Onset[]
  bleed?: BleedInfo | null
  error?: string
}

let worker: Worker | null | undefined
let seq = 0
const pending = new Map<number, (r: Res) => void>()

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./onset.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Res>) => {
      pending.get(e.data.id)?.(e.data)
      pending.delete(e.data.id)
    }
    worker.onerror = () => {
      // 워커가 죽으면 기다리던 것들은 빈 결과로 풀고, 다음부턴 화면 스레드에서
      for (const [id, res] of pending) res({ id, error: 'worker error' })
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

/** samples·reference 는 넘겨주고 나면 못 쓴다 (워커로 옮김) */
export async function detectOnsetsOffThread(
  samples: Float32Array,
  sampleRate: number,
  opts: { reference?: Float32Array; referenceLag?: number | null } = {},
): Promise<{ onsets: Onset[]; bleed: BleedInfo | null }> {
  const w = getWorker()
  if (!w) {
    let bleed: BleedInfo | null = null
    const onsets = await detectOnsets(samples, sampleRate, { ...opts, onBleed: b => (bleed = b) })
    return { onsets, bleed }
  }
  const id = ++seq
  const res = await new Promise<Res>(resolve => {
    pending.set(id, resolve)
    const transfer: ArrayBuffer[] = [samples.buffer as ArrayBuffer]
    if (opts.reference) transfer.push(opts.reference.buffer as ArrayBuffer)
    w.postMessage({ id, samples, sampleRate, reference: opts.reference, referenceLag: opts.referenceLag ?? null }, transfer)
  })
  if (res.error || !res.onsets) throw new Error(res.error || 'no result')
  return { onsets: res.onsets, bleed: res.bleed ?? null }
}

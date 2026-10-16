'use client'

import { useEffect, useRef, useState } from 'react'
import BackButton from '@/components/BackButton'
import { PracticeAudio } from '@/lib/practice/engine'
import { BASS_TUNINGS, detectPitch, GUITAR_TUNINGS, hzToMidi, midiToHz, nearestString, noteName } from '@/lib/practice/pitch'

type Inst = 'guitar' | 'bass'

const PREF_KEY = 'tunerPrefs'

// 튜너: 마이크로 줄 소리를 듣고 몇 cent 높은지/낮은지 바늘로 보여준다
export default function TunerPage() {
  const [inst, setInst] = useState<Inst>('guitar')
  const [tuningKey, setTuningKey] = useState('std')
  const [a4, setA4] = useState(440)
  const [lock, setLock] = useState<number | null>(null) // 고정한 줄 (null = 자동)
  const [on, setOn] = useState(false)
  const [error, setError] = useState('')
  const [reading, setReading] = useState<{ midi: number; cents: number; string: number; hz: number } | null>(null)
  const audioRef = useRef<PracticeAudio | null>(null)
  const rafRef = useRef(0)
  const histRef = useRef<number[]>([])
  const lastHeard = useRef(0)
  const lockRef = useRef<number | null>(null)
  const startingRef = useRef(false)
  const ignoreUntil = useRef(0) // 기준음이 울리는 동안은 마이크 소리를 안 잰다 (자기 소리를 재면 늘 '맞음')
  const settingsRef = useRef({ inst, tuningKey, a4 })

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null')
      if (p) {
        setInst(p.inst ?? 'guitar')
        setTuningKey(p.tuningKey ?? 'std')
        setA4(p.a4 ?? 440)
      }
    } catch {}
  }, [])
  useEffect(() => {
    settingsRef.current = { inst, tuningKey, a4 }
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({ inst, tuningKey, a4 }))
    } catch {}
  }, [inst, tuningKey, a4])
  useEffect(() => {
    lockRef.current = lock
  }, [lock])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      audioRef.current?.close()
    }
  }, [])

  const tunings = inst === 'guitar' ? GUITAR_TUNINGS : BASS_TUNINGS
  const tuning = tunings.find(t => t.key === tuningKey) ?? tunings[0]

  const start = async () => {
    if (startingRef.current || on) return // 두 번 눌러도 마이크·반복은 하나만
    startingRef.current = true
    setError('')
    try {
      let audio = audioRef.current
      if (audio) PracticeAudio.setSession('play-and-record')
      else audio = audioRef.current = await PracticeAudio.open('play-and-record')
      await audio.ctx.resume()
      await audio.openMic()
      setOn(true)
      const sr = audio.ctx.sampleRate
      // 기타는 2048 샘플이면 충분, 베이스(낮은 E 41Hz, 반음 내림 39Hz)는 4096
      const bufs = { guitar: new Float32Array(2048), bass: new Float32Array(4096) }
      let last = 0
      cancelAnimationFrame(rafRef.current)
      const loop = () => {
        rafRef.current = requestAnimationFrame(loop)
        const now = performance.now()
        if (now - last < 50) return // 화면 주사율과 상관없이 초당 20번 정도
        last = now
        if (now < ignoreUntil.current) return
        const { inst: i, tuningKey: tk, a4: ref } = settingsRef.current
        const buf = bufs[i]
        if (!audio.micSamples(buf)) return
        const tus = i === 'guitar' ? GUITAR_TUNINGS : BASS_TUNINGS
        const tu = tus.find(t => t.key === tk) ?? tus[0]
        const r = detectPitch(buf, sr, i === 'bass' ? 25 : 60, i === 'bass' ? 500 : 1200)
        if (!r || r.clarity < 0.85) {
          if (now - lastHeard.current > 1500) {
            histRef.current = []
            setReading(null)
          }
          return
        }
        lastHeard.current = now
        // 흔들림 줄이기: 최근 5개 중앙값 (반음 넘게 튀면 새로 시작)
        const m = hzToMidi(r.hz, ref)
        const h = histRef.current
        if (h.length && Math.abs(h[h.length - 1] - m) > 0.7) h.length = 0
        h.push(m)
        if (h.length > 5) h.shift()
        const med = [...h].sort((a, b) => a - b)[Math.floor(h.length / 2)]
        const sIdx = lockRef.current ?? nearestString(med, tu.strings)
        const target = tu.strings[sIdx]
        // 고정한 줄이 옥타브 위아래로 들리면(배음) 그 옥타브 기준으로
        let diff = med - target
        if (lockRef.current !== null) diff -= 12 * Math.round(diff / 12)
        setReading({ midi: med, cents: diff * 100, string: sIdx, hz: r.hz })
      }
      rafRef.current = requestAnimationFrame(loop)
    } catch (e) {
      const name = (e as { name?: string })?.name
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? '마이크 권한이 꺼져 있어요. 브라우저(또는 설정 → 사파리 → 마이크)에서 허용해 주세요.'
          : (e as Error)?.message || '마이크를 열지 못했어요.',
      )
    } finally {
      startingRef.current = false
    }
  }

  const stop = () => {
    cancelAnimationFrame(rafRef.current)
    audioRef.current?.closeMic()
    setOn(false)
    setReading(null)
  }

  // 기준음 들려주기 (줄 뜯는 소리 비슷하게)
  const playRef = async (midi: number) => {
    const audio = audioRef.current ?? (await PracticeAudio.open('playback'))
    audioRef.current = audio
    await audio.ctx.resume()
    const sr = audio.ctx.sampleRate
    const f = midiToHz(midi, a4)
    const len = Math.round(sr * 2)
    const x = new Float32Array(len)
    for (let i = 0; i < len; i++) {
      const t = i / sr
      let v = 0
      ;[1, 0.5, 0.3, 0.15].forEach((a, k) => (v += a * Math.sin(2 * Math.PI * f * (k + 1) * t) * Math.exp(-t * (1.2 + k))))
      x[i] = v * 0.35 * Math.min(1, i / (sr * 0.004))
    }
    audio.stopAll()
    audio.play(audio.makeBuffer([x]), audio.ctx.currentTime + 0.02)
    // 기준음이 잦아들 때까지는 튜너 바늘을 비운다
    ignoreUntil.current = performance.now() + 2100
    histRef.current = []
    setReading(null)
  }

  const cents = reading ? Math.max(-50, Math.min(50, reading.cents)) : 0
  const inTune = reading !== null && Math.abs(reading.cents) <= 5
  const near = reading !== null && Math.abs(reading.cents) <= 15
  const color = !reading ? '#a1a1aa' : inTune ? '#10b981' : near ? '#f59e0b' : '#ef4444'
  const target = reading ? tuning.strings[reading.string] : null
  const nStr = tuning.strings.length

  return (
    <main className="px-4 pt-6">
      <BackButton fallback="/practice" />
      <h1 className="text-2xl font-bold">🎚️ 튜너</h1>

      <section className="mt-4 space-y-3 rounded-2xl bg-surface p-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1 text-sm font-semibold">
          {(['guitar', 'bass'] as const).map(k => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setInst(k)
                setLock(null)
              }}
              className={`rounded-lg py-2 ${inst === k ? 'bg-surface shadow-sm' : 'text-zinc-500'}`}
            >
              {k === 'guitar' ? '🎸 기타 (6현)' : '🎻 베이스 (4현)'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tunings.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setTuningKey(t.key)
                setLock(null)
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === tuning.key ? 'bg-brand text-white' : 'bg-surface-2 text-zinc-600'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-500">
          {tuning.label}: {tuning.strings.map(m => noteName(m, tuning.flats).replace(/\d/, '')).join(' ')}
          {tuning.key === 'half' && ' — 모든 줄을 반음씩 내린 튜닝 (E♭ 튜닝)'}
        </p>
      </section>

      {/* 바늘 */}
      <section className="mt-4 rounded-2xl bg-surface p-5 text-center">
        <div className="text-6xl font-extrabold tabular-nums" style={{ color }}>
          {reading ? noteName(reading.midi, tuning.flats).replace(/-?\d+$/, '') : '–'}
        </div>
        <div className="mt-1 h-5 text-sm text-zinc-500">
          {reading && target !== null
            ? `${nStr - reading.string}번줄 ${noteName(target, tuning.flats)} 목표 · ${reading.hz.toFixed(1)}Hz`
            : on
              ? '줄을 한 번 튕겨 보세요'
              : ''}
        </div>
        <svg viewBox="-110 -100 220 115" className="mx-auto mt-2 w-full max-w-xs">
          {Array.from({ length: 11 }, (_, i) => {
            const c = -50 + i * 10
            const a = (c / 50) * (Math.PI / 3)
            const r0 = c % 50 === 0 ? 78 : 84
            return (
              <line
                key={c}
                x1={Math.sin(a) * r0}
                y1={-Math.cos(a) * r0}
                x2={Math.sin(a) * 92}
                y2={-Math.cos(a) * 92}
                stroke={c === 0 ? '#10b981' : '#d4d4d8'}
                strokeWidth={c === 0 ? 3 : 1.5}
              />
            )
          })}
          <path d={`M ${Math.sin(-Math.PI / 30) * 92} ${-Math.cos(Math.PI / 30) * 92} A 92 92 0 0 1 ${Math.sin(Math.PI / 30) * 92} ${-Math.cos(Math.PI / 30) * 92}`} stroke="#10b981" strokeWidth={6} fill="none" opacity={0.35} />
          <line
            x1={0}
            y1={0}
            x2={Math.sin((cents / 50) * (Math.PI / 3)) * 86}
            y2={-Math.cos((cents / 50) * (Math.PI / 3)) * 86}
            stroke={color}
            strokeWidth={3.5}
            strokeLinecap="round"
            style={{ transition: 'all 90ms linear' }}
          />
          <circle cx={0} cy={0} r={6} fill={color} />
          <text x={-96} y={12} fontSize={10} fill="#a1a1aa">
            낮음
          </text>
          <text x={96} y={12} fontSize={10} fill="#a1a1aa" textAnchor="end">
            높음
          </text>
        </svg>
        <div className="mt-1 text-lg font-bold tabular-nums" style={{ color }}>
          {reading ? (inTune ? '✓ 딱 맞아요' : `${reading.cents > 0 ? '+' : ''}${Math.round(reading.cents)} cent ${reading.cents > 0 ? '· 줄을 풀어요' : '· 줄을 감아요'}`) : ' '}
        </div>

        {error && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p>}
        <button
          type="button"
          onClick={on ? stop : start}
          className={`mt-4 w-full rounded-xl py-3 text-base font-bold ${on ? 'bg-surface-2 text-zinc-700' : 'bg-brand text-white'}`}
        >
          {on ? '■ 튜너 끄기' : '🎙 튜너 켜기'}
        </button>
      </section>

      {/* 줄 */}
      <section className="mt-4 rounded-2xl bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">줄</h2>
          <button type="button" onClick={() => setLock(null)} className={`text-xs font-semibold ${lock === null ? 'text-brand' : 'text-zinc-500'}`}>
            {lock === null ? '● 자동으로 줄 찾기' : '자동으로 돌아가기'}
          </button>
        </div>
        <div className={`mt-2 grid gap-1.5 ${nStr === 6 ? 'grid-cols-6' : 'grid-cols-4'}`}>
          {tuning.strings.map((m, i) => {
            const active = reading?.string === i
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setLock(i)
                  playRef(m)
                }}
                className={`flex flex-col items-center rounded-xl py-2 ${
                  lock === i ? 'bg-brand text-white' : active ? (inTune ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800') : 'bg-surface-2'
                }`}
              >
                <span className="text-lg font-bold">{noteName(m, tuning.flats).replace(/-?\d+$/, '')}</span>
                <span className="text-[10px] opacity-70">{nStr - i}번</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          줄 버튼을 누르면 그 줄 기준음이 나오고, 그 줄에 맞춰 바늘이 고정돼요. 조용한 데서 한 줄씩 튕기세요.
        </p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-zinc-500">기준음 A4</span>
          <span className="flex items-center gap-2">
            <button type="button" onClick={() => setA4(v => Math.max(430, v - 1))} className="h-8 w-8 rounded-full bg-surface-2 font-bold">
              −
            </button>
            <span className="w-16 text-center font-semibold tabular-nums">{a4}Hz</span>
            <button type="button" onClick={() => setA4(v => Math.min(450, v + 1))} className="h-8 w-8 rounded-full bg-surface-2 font-bold">
              +
            </button>
          </span>
        </div>
      </section>
    </main>
  )
}

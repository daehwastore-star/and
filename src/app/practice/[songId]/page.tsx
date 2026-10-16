'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import BackButton from '@/components/BackButton'
import ScoreView, { EARLY, EXAG, LATE, type HitMark } from '@/components/practice/ScoreView'
import Feedback from '@/components/practice/Feedback'
import SessionList from '@/components/practice/SessionList'
import Troubles from '@/components/practice/Troubles'
import LapChips, { LiveLapChips } from '@/components/practice/LapChips'
import LapOverview from '@/components/practice/LapOverview'
import { detectOnsets, estimateLatency, summarize } from '@/lib/practice/analysis'
import { clickSamples, renderCalibration } from '@/lib/practice/sounds'
import { PracticeAudio, type Recording } from '@/lib/practice/engine'
import { StemPlayer } from '@/lib/practice/player'
import { LiveTracker, type LiveState } from '@/lib/practice/live'
import { PARTS, partInfo } from '@/lib/practice/parts'
import { expectedFromOnsets, onsetsOf, parseScore, scoreHash, type Onset, type PartScore } from '@/lib/practice/score'
import {
  decodeResult,
  encodeLoopResult,
  encodeResult,
  frequentTroubles,
  loopStats,
  mergeLaps,
  sessionLaps,
  sessionTries,
  type LapResult,
  type SessionRow,
} from '@/lib/practice/sessions'
import { analyzeLoop, analyzeRecording, LAT_KEY, loopLapLimit, readJSON, trimMatch, writeJSON } from '@/lib/practice/check'
import { getMyId } from '@/lib/identity'
import { partEmoji } from '@/lib/sheets'

interface PracticeConfig {
  bpm: number
  beatsPerBar: number
  countInBeats: number
  bars: number
}
interface SongData {
  id: string
  title: string
  artist: string | null
  practice: PracticeConfig | null
  stems: { part: string; file: string; hasScore: boolean }[]
  sheets: { id: string; part: string; file: string; filename: string }[]
}
interface LoadedScore {
  json: string
  score: PartScore
  onsets: Onset[]
  hash: string
}
// 이번에 녹음한 연습 (녹음 원본은 메모리에만 — '내 연주 듣기'용). 한 번 친 것은 바퀴 하나
interface Take {
  laps: LapResult[] // 바퀴마다 시각은 그 바퀴 시작 기준
  loop: boolean
  loopLen: number // 한 바퀴 길이 (초) — 바퀴 k 의 녹음 위치 = gridOrigin + k × loopLen
  fromBar: number
  toBar: number // 반복이면 반복 구간 끝, 한 번 친 것은 분석한 끝 마디
  calibrated: boolean
  latency: number
  rec: Recording
  gridOrigin: number
  buffer?: AudioBuffer
  sessionId?: string // 자동 저장된 기록
}

type Phase = 'idle' | 'playing' | 'calibrating' | 'analyzing'

const prefKey = (id: string) => `practicePrefs:${id}`
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function PracticePage({ params }: { params: Promise<{ songId: string }> }) {
  const { songId } = use(params)
  const [song, setSong] = useState<SongData | null>(null)
  const [error, setError] = useState('')
  const [myPart, setMyPart] = useState<string>('none')
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})
  const [volume, setVolume] = useState<Record<string, number>>({})
  const [showMixer, setShowMixer] = useState(false)
  const [range, setRange] = useState({ from: 1, to: 1 })
  const [loop, setLoop] = useState(false)
  const [record, setRecord] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const [latency, setLatency] = useState<{ ms: number; at: string } | null>(null)
  const [scores, setScores] = useState<Record<string, LoadedScore>>({})
  const [live, setLive] = useState<LiveState | null>(null)
  const [take, setTake] = useState<Take | null>(null)
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [selSession, setSelSession] = useState<string | null>(null) // null = 방금 한 연습
  const [selectedBar, setSelectedBar] = useState<number | null>(null)
  const [relativePick, setRelativePick] = useState<boolean | null>(null)
  const [showHeat, setShowHeat] = useState(false)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [lastBar, setLastBar] = useState<number | null>(null)
  const [picking, setPicking] = useState(false) // 악보에서 구간 고르는 중
  const [pickAnchor, setPickAnchor] = useState<number | null>(null) // 처음 누른 마디 (다음에 누르는 마디가 끝)
  const [lapSel, setLapSel] = useState<number | 'all'>('all') // 반복 연습 결과에서 볼 바퀴

  const audioRef = useRef<PracticeAudio | null>(null)
  const playerRef = useRef<StemPlayer | null>(null)
  const trackerRef = useRef<LiveTracker | null>(null)
  const busyRef = useRef(false)
  const finishingRef = useRef(false)
  const unmounted = useRef(false)
  const runRef = useRef<{
    gridOrigin: number
    clickTimes: number[]
    from: number
    to: number
    recording: boolean
    metro: boolean
    bleedScale: number
    lat: number
    part: string
    loop: boolean
    loopLen: number
    maxLaps: number | null // 녹음하며 반복할 때 안전장치로 멈출 바퀴 수
  } | null>(null)
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null)
  const scoreRef = useRef<HTMLDivElement>(null)
  const myId = typeof window !== 'undefined' ? getMyId() : null

  // ───────── 불러오기 ─────────
  useEffect(() => {
    unmounted.current = false
    fetch(`/api/practice/${songId}`)
      .then(r => r.json())
      .then((d: { song?: SongData }) => {
        if (!d.song) return setError('곡을 찾을 수 없어요')
        setSong(d.song)
        const cfg = d.song.practice
        if (cfg) setRange({ from: 1, to: cfg.bars })
        const parts = d.song.stems.map(s => s.part)
        const pref = readJSON<{ myPart?: string; enabled?: Record<string, boolean> }>(prefKey(songId))
        const scored = d.song.stems.filter(s => s.hasScore).map(s => s.part)
        const mp = pref?.myPart && (pref.myPart === 'none' || scored.includes(pref.myPart)) ? pref.myPart : scored.includes('drums') ? 'drums' : scored[0] ?? 'none'
        setMyPart(mp)
        const en: Record<string, boolean> = {}
        for (const p of parts) en[p] = pref?.enabled?.[p] ?? p !== mp
        setEnabled(en)
      })
      .catch(() => setError('불러오지 못했어요'))
    setLatency(readJSON(LAT_KEY))
    return () => {
      unmounted.current = true
      trackerRef.current?.stop()
      playerRef.current?.dispose()
      audioRef.current?.close()
      audioRef.current = null
      playerRef.current = null
      wakeRef.current?.release().catch(() => {})
    }
  }, [songId])

  const cfg = song?.practice ?? null
  const parts = PARTS.map(p => p.key).filter(k => song?.stems.some(s => s.part === k))
  const scoredParts = PARTS.map(p => p.key).filter(k => song?.stems.some(s => s.part === k && s.hasScore))
  const cur = myPart !== 'none' ? scores[myPart] : undefined

  // 내 파트 악보 받기
  useEffect(() => {
    if (myPart === 'none' || scores[myPart]) return
    fetch(`/api/practice/${songId}/score?part=${myPart}`)
      .then(r => (r.ok ? r.text() : null))
      .then(json => {
        if (!json) return
        const sc = parseScore(json)
        if (!sc) return
        setScores(prev => ({ ...prev, [myPart]: { json, score: sc, onsets: onsetsOf(sc), hash: scoreHash(json) } }))
      })
      .catch(() => {})
  }, [myPart, songId, scores])

  // 내 연습 기록 (내 것만)
  const loadSessions = useCallback(async () => {
    if (!myId || myPart === 'none') return setSessions([])
    const r = await fetch(`/api/practice/${songId}/sessions?memberId=${encodeURIComponent(myId)}&part=${encodeURIComponent(myPart)}`)
    const d = await r.json().catch(() => ({ sessions: [] }))
    setSessions(d.sessions ?? [])
  }, [myId, myPart, songId])
  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const savePrefs = (mp: string, en: Record<string, boolean>) => writeJSON(prefKey(songId), { myPart: mp, enabled: en })

  // ───────── 오디오 ─────────
  // 아이폰: 마이크를 열기 전에 세션이 'play-and-record' 여야 한다 (처음 열 때 'playback' 으로 덮어쓰면 첫 녹음이 무음)
  const getAudio = useCallback(async (session: 'playback' | 'play-and-record' = 'playback') => {
    if (!audioRef.current) audioRef.current = await PracticeAudio.open(session)
    else PracticeAudio.setSession(session)
    await audioRef.current.ctx.resume()
    return audioRef.current
  }, [])

  const getPlayer = useCallback(async () => {
    if (!song || !cfg) throw new Error('연습 음원이 아직 없어요')
    const audio = await getAudio()
    if (!playerRef.current) {
      const p = new StemPlayer(audio, cfg, song.stems.map(s => ({ part: s.part, url: `/api/photos/${s.file}` })))
      playerRef.current = p
      for (const part of p.parts) {
        p.setEnabled(part, enabled[part] ?? true)
        p.setVolume(part, volume[part] ?? 1)
      }
      await p.calibrateTimeline().catch(() => {})
    }
    return playerRef.current
  }, [song, cfg, getAudio, enabled, volume])

  const toggle = (part: string) => {
    setEnabled(prev => {
      const next = { ...prev, [part]: !prev[part] }
      playerRef.current?.setEnabled(part, next[part])
      savePrefs(myPart, next)
      return next
    })
  }
  const chooseMyPart = (mp: string) => {
    setMyPart(mp)
    setSelSession(null)
    setTake(null)
    setSelectedBar(null)
    setPicking(false)
    setPickAnchor(null)
    setEnabled(prev => {
      // 내 파트는 끄고, 이전에 내 파트였던 건 다시 켠다
      const next = { ...prev }
      if (myPart !== 'none' && myPart in next) next[myPart] = true
      if (mp !== 'none' && mp in next) next[mp] = false
      for (const p of Object.keys(next)) playerRef.current?.setEnabled(p, next[p])
      savePrefs(mp, next)
      return next
    })
  }

  // ───────── 연습하기 ─────────
  // plan 을 주면 지금 고른 구간·반복 대신 그걸로 ('이 마디 반복 연습' 처럼 바로 시작할 때)
  const start = async (plan?: { from: number; to: number; loop: boolean }) => {
    if (busyRef.current || finishingRef.current || !cfg) return
    busyRef.current = true
    setMessage('')
    setPicking(false)
    setPickAnchor(null)
    const fromBar = plan?.from ?? range.from
    const looping = plan?.loop ?? loop
    const recording = record && myPart !== 'none' && !!cur
    let recStarted = false
    try {
      const audio = await getAudio(recording ? 'play-and-record' : 'playback')
      if (recording) await audio.openMic()
      const player = await getPlayer()
      if (unmounted.current) return
      audio.stopAll()
      if (recording) {
        audio.startRecording()
        recStarted = true
      }
      const to = Math.max(fromBar, plan?.to ?? range.to)
      const loopLen = (to - fromBar + 1) * player.barLen
      const maxLaps = looping && recording ? loopLapLimit(loopLen) : null
      const r = await player.play({ fromBar, toBar: to, loop: looping, ...(maxLaps ? { maxLaps } : {}) })
      const mg = player.metronomeGains()
      const lat = latency ? latency.ms / 1000 : (audio.ctx.outputLatency || 0) + (audio.ctx.baseLatency || 0) + 0.03
      runRef.current = {
        gridOrigin: r.gridOrigin,
        clickTimes: r.clickTimes,
        from: fromBar,
        to,
        recording,
        metro: !!enabled.metronome,
        bleedScale: mg.countIn > 0 ? mg.song / mg.countIn : 1,
        lat,
        part: myPart,
        loop: looping,
        loopLen: r.loopLen,
        maxLaps,
      }
      player.onEnded = () => finish(false)
      setSelSession(null)
      setSelectedBar(null)
      if (recording && cur) {
        setTake(null)
        setLive({ marks: new Map(), extras: [], lap: 0, laps: [] })
        const tr = new LiveTracker(audio, {
          gridOrigin: r.gridOrigin,
          latency: latency ? latency.ms / 1000 : null,
          expected: expectedFromOnsets(cur.onsets, cfg.bpm, cfg.beatsPerBar, fromBar, to),
          clickTimes: r.clickTimes,
          countInBeats: cfg.countInBeats,
          metronomeAudible: !!enabled.metronome,
          bleedScale: runRef.current.bleedScale,
          ...(looping ? { loopLen: r.loopLen, maxLaps: maxLaps ?? undefined } : {}),
          onUpdate: s => !unmounted.current && setLive(s),
        })
        trackerRef.current = tr
        tr.start()
      }
      if (!recording) setLive(null)
      setPhase('playing')
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
        wakeRef.current = (await nav.wakeLock?.request('screen')) ?? null
      } catch {}
      setTimeout(() => scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (e) {
      setMessage(errorText(e))
      setPhase('idle')
      // 녹음기·마이크·세션을 되돌린다
      const audio = audioRef.current
      if (audio && recStarted) await audio.stopRecording().catch(() => {})
      audio?.closeMic()
      if (recording) PracticeAudio.setSession('playback')
    } finally {
      busyRef.current = false
    }
  }

  const finish = async (early: boolean) => {
    const player = playerRef.current
    const audio = audioRef.current
    if (!player || !audio || finishingRef.current) return
    const run = runRef.current
    runRef.current = null
    finishingRef.current = true
    try {
      await finishRun(player, audio, run, early)
    } finally {
      finishingRef.current = false
    }
  }

  const finishRun = async (player: StemPlayer, audio: PracticeAudio, run: typeof runRef.current, early: boolean) => {
    const nowCtx = audio.ctx.currentTime
    const pos = player.beatNow()
    player.onEnded = null
    player.stop()
    trackerRef.current?.stop()
    trackerRef.current = null
    wakeRef.current?.release().catch(() => {})
    wakeRef.current = null
    if (pos !== null && cfg) setLastBar(Math.max(1, Math.floor(pos / cfg.beatsPerBar) + 1))
    if (!run || !run.recording || !cfg) {
      setLive(null)
      setPhase('idle')
      return
    }
    const sc = scores[run.part]
    try {
      // 마지막 박에 친 소리가 지연만큼 늦게 들어오니 조금 더 녹음하고 멈춘다
      setPhase('analyzing')
      setProgress(0)
      const tailUntil = nowCtx + Math.max(run.lat, 0.3) + 0.35
      while (audio.ctx.currentTime < tailUntil && audio.ctx.state === 'running') await sleep(40)
      const rec = await audio.stopRecording()
      audio.closeMic()
      PracticeAudio.setSession('playback')
      if (unmounted.current || !sc) return
      const spb = 60 / cfg.bpm
      const barLen = cfg.beatsPerBar * spb
      const scoreHash = sc.hash
      if (run.loop) {
        // 구간 반복: 다 돈 바퀴 + 멈춘 바퀴에서 1마디 이상 친 것
        const L = run.loopLen
        const elapsed = nowCtx - run.gridOrigin
        let full = Math.max(0, Math.floor(elapsed / L + 1e-6))
        if (run.maxLaps) full = Math.min(full, run.maxLaps)
        const partialBars = early ? Math.max(0, Math.min(run.to - run.from, Math.floor((elapsed - full * L) / barLen + 1e-6))) : 0
        if (full === 0 && partialBars === 0) {
          setLive(null)
          setPhase('idle')
          setMessage('첫 마디가 끝나기 전에 멈춰서 기록하지 않았어요.')
          return
        }
        await sleep(30)
        const out = await analyzeLoop({
          expected: expectedFromOnsets(sc.onsets, cfg.bpm, cfg.beatsPerBar, run.from, run.to),
          rec,
          gridOriginCtx: run.gridOrigin,
          latency: latency ? latency.ms / 1000 : null,
          bpm: cfg.bpm,
          beatsPerBar: cfg.beatsPerBar,
          countInBeats: cfg.countInBeats,
          fromBar: run.from,
          toBar: run.to,
          loopLen: L,
          laps: full,
          partialBars,
          clickTimes: run.clickTimes,
          metronomeAudible: run.metro,
          bleedScale: run.bleedScale,
          onProgress: setProgress,
        })
        if (unmounted.current) return
        const t: Take = { laps: out.laps, loop: true, loopLen: L, fromBar: run.from, toBar: run.to, calibrated: out.calibrated, latency: out.latency, rec, gridOrigin: run.gridOrigin }
        setTake(t)
        setLive(null)
        setRelativePick(null)
        setLapSel(out.laps.length > 1 ? 'all' : 0)
        const st = loopStats(out.laps, { fromBar: t.fromBar, toBar: t.toBar, calibrated: t.calibrated, barLen })
        setSelectedBar(summarize(mergeLaps(out.laps), t.fromBar, t.toBar, t.calibrated ? 0 : st.medianDev, barLen).worst[0] ?? null)
        if (!early && run.maxLaps && full >= run.maxLaps) setMessage(`반복 녹음은 한 번에 최대 40바퀴·10분까지라 ${full}바퀴에서 멈췄어요.`)
        await saveTake(t, run.part, {
          accuracy: st.accuracy,
          medianDev: st.medianDev,
          meanAbs: st.meanAbs,
          missed: st.missed,
          extras: st.extras,
          result: encodeLoopResult(out.laps, { scoreHash, latencyMs: Math.round(t.latency * 1000), fromBar: t.fromBar, toBar: t.toBar, beatsPerBar: cfg.beatsPerBar, bpm: cfg.bpm }),
        })
        setTimeout(() => document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
        return
      }
      if (early && nowCtx < run.gridOrigin + barLen) {
        setLive(null)
        setPhase('idle')
        setMessage('첫 마디가 끝나기 전에 멈춰서 기록하지 않았어요.')
        return
      }
      const stoppedAtBar = early ? Math.max(run.from, Math.min(run.to, run.from + Math.floor((nowCtx - run.gridOrigin) / barLen) - 1)) : run.to
      await sleep(30)
      const out = await analyzeRecording({
        expected: expectedFromOnsets(sc.onsets, cfg.bpm, cfg.beatsPerBar, run.from, stoppedAtBar),
        rec,
        gridOriginCtx: run.gridOrigin,
        latency: latency ? latency.ms / 1000 : null,
        bpm: cfg.bpm,
        beatsPerBar: cfg.beatsPerBar,
        countInBeats: cfg.countInBeats,
        fromBar: run.from,
        stoppedAtBar,
        clickTimes: run.clickTimes,
        metronomeAudible: run.metro,
        bleedScale: run.bleedScale,
        onProgress: setProgress,
      })
      if (unmounted.current) return
      const trimmed = early ? trimMatch(out.match, run.from, stoppedAtBar, barLen) : { match: out.match, toBar: stoppedAtBar }
      const t: Take = {
        laps: [{ match: trimmed.match, toBar: trimmed.toBar }],
        loop: false,
        loopLen: 0,
        fromBar: run.from,
        toBar: trimmed.toBar,
        calibrated: out.calibrated,
        latency: out.latency,
        rec,
        gridOrigin: run.gridOrigin,
      }
      setTake(t)
      setLive(null)
      setRelativePick(null)
      setLapSel(0)
      const raw = summarize(trimmed.match, t.fromBar, t.toBar, 0, barLen)
      const sum = t.calibrated ? raw : summarize(trimmed.match, t.fromBar, t.toBar, raw.medianDev, barLen)
      setSelectedBar(sum.worst[0] ?? null)
      await saveTake(t, run.part, {
        accuracy: sum.accuracy,
        medianDev: raw.medianDev,
        meanAbs: sum.meanAbs,
        missed: sum.missed,
        extras: sum.extras,
        result: encodeResult(trimmed.match, { scoreHash, latencyMs: Math.round(t.latency * 1000), fromBar: t.fromBar, beatsPerBar: cfg.beatsPerBar, bpm: cfg.bpm }),
      })
      setTimeout(() => document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      if (!unmounted.current) setPhase('idle')
    }
  }

  // 자동 저장 (내 기록)
  const saveTake = async (t: Take, part: string, stats: { accuracy: number; medianDev: number; meanAbs: number; missed: number; extras: number; result: string }) => {
    if (!myId || !cfg) return
    await fetch(`/api/practice/${songId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: myId, part, fromBar: t.fromBar, toBar: t.toBar, bpm: cfg.bpm, calibrated: t.calibrated, ...stats }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.session) {
          setSessions(prev => [d.session, ...prev])
          setTake(prev => (prev === t ? { ...t, sessionId: d.session.id } : prev))
        }
      })
      .catch(() => setMessage('연습 기록을 저장하지 못했어요 (인터넷 확인).'))
  }

  const stop = () => {
    if (runRef.current) finish(true)
  }

  // 이 마디만 반복 연습 (피드백·자주 틀리는 곳에서 바로 시작)
  const loopBar = (m: number) => {
    setRange({ from: m, to: m })
    setLoop(true)
    start({ from: m, to: m, loop: true })
  }

  // 악보에서 구간 고르기: 처음 누른 마디 = 시작, 다음에 누른 마디 = 끝 (같은 마디 두 번 = 그 마디만)
  const pickBar = (m: number) => {
    if (pickAnchor === null) {
      setPickAnchor(m)
      setRange({ from: m, to: m })
      return
    }
    setRange({ from: Math.min(pickAnchor, m), to: Math.max(pickAnchor, m) })
    setPickAnchor(null)
    setLoop(true)
  }

  // ───────── 지연 측정 ─────────
  const calibrate = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setMessage('')
    setPhase('calibrating')
    try {
      const audio = await getAudio('play-and-record')
      audio.stopAll()
      await audio.openMic()
      const sr = audio.ctx.sampleRate
      const cal = renderCalibration(sr)
      audio.startRecording()
      const when = audio.ctx.currentTime + 0.3
      audio.play(audio.makeBuffer([cal.samples]), when)
      await sleep((cal.duration + 0.6) * 1000)
      const rec = await audio.stopRecording()
      audio.closeMic()
      PracticeAudio.setSession('playback')
      const onsets = await detectOnsets(rec.samples, rec.sampleRate)
      const r = estimateLatency(
        cal.times,
        onsets.map(o => rec.startTime + o.time - when),
        onsets.map(o => o.strength),
      )
      if (!r.ok) {
        setMessage(
          r.matched === 0
            ? '딸깍 소리를 못 들었어요. 볼륨을 키우고, 이어폰이면 한쪽을 폰 마이크(아래쪽)에 바짝 대고 다시 해 주세요.'
            : '소리가 고르게 안 잡혔어요. 조용한 곳에서 다시 해 주세요.',
        )
      } else {
        const v = { ms: Math.round(r.latency * 1000), at: new Date().toISOString() }
        setLatency(v)
        writeJSON(LAT_KEY, v)
        setMessage(`지연 ${v.ms}ms — 저장했어요. 이 기기·이 이어폰(스피커)으로 할 땐 다시 안 재도 돼요.`)
      }
    } catch (e) {
      setMessage(errorText(e))
    } finally {
      busyRef.current = false
      if (!unmounted.current) setPhase('idle')
    }
  }

  // ───────── 보여줄 결과 (방금 한 것 / 고른 기록) ─────────
  const view = useMemo(() => {
    if (!cfg || !cur) return null
    const barLen = cfg.beatsPerBar * (60 / cfg.bpm)
    if (selSession && selSession !== take?.sessionId) {
      const s = sessions.find(x => x.id === selSession)
      const d = s ? decodeResult(s) : null
      if (!s || !d) return null
      const fits = d.scoreHash === cur.hash
      if (!fits) return { title: '', stale: true as const }
      const laps = sessionLaps(s, d, cur.onsets, cfg.beatsPerBar)
      return { title: fmtDate(s.createdAt), laps, loop: d.loop, fromBar: s.fromBar, toBar: s.toBar, calibrated: s.calibrated, barLen, stale: false as const, current: false }
    }
    if (take && (!selSession || selSession === take.sessionId))
      return {
        title: take.loop ? '방금 한 반복 연습' : '방금 한 연습',
        laps: take.laps,
        loop: take.loop,
        fromBar: take.fromBar,
        toBar: take.toBar,
        calibrated: take.calibrated,
        barLen,
        stale: false as const,
        current: true,
      }
    return null
  }, [cfg, cur, selSession, sessions, take])

  const fresh = view && !view.stale ? view : null
  const multiLap = !!fresh && fresh.loop && fresh.laps.length > 1
  // 볼 바퀴 (null = '전체')
  const lapIdx = !fresh ? null : multiLap ? (lapSel === 'all' ? null : Math.min(lapSel, fresh.laps.length - 1)) : 0
  const lap = fresh && lapIdx !== null ? fresh.laps[lapIdx] : null
  const relative = relativePick ?? (fresh ? !fresh.calibrated : false)
  // '내 평균'은 모든 바퀴를 합친 중앙값 (한 번 친 것은 그 연습의 중앙값 — 예전과 같다)
  const raw = useMemo(() => (fresh ? summarize(mergeLaps(fresh.laps), fresh.fromBar, fresh.toBar, 0, fresh.barLen) : null), [fresh])
  const offset = relative && raw ? raw.medianDev : 0
  const summary = useMemo(() => (fresh && lap ? summarize(lap.match, fresh.fromBar, lap.toBar, offset, fresh.barLen) : null), [fresh, lap, offset])
  // '전체' 보기: 바퀴별 요약 · 합친 요약 · 여러 바퀴에서 틀린 음
  const overview = useMemo(() => {
    if (!fresh || !multiLap || !cur || !cfg) return null
    const each = fresh.laps.map(l => summarize(l.match, fresh.fromBar, l.toBar, offset, fresh.barLen))
    const pooled = summarize(mergeLaps(fresh.laps), fresh.fromBar, fresh.toBar, offset, fresh.barLen)
    const tries = fresh.laps.map(l => ({ hits: l.match.hits.map(h => [h.idx, h.dev] as [number, number | null]), offset }))
    return {
      lapAcc: each.map(x => x.accuracy),
      mean: Math.round(each.reduce((x, y) => x + y.accuracy, 0) / each.length),
      pooled,
      troubles: frequentTroubles(tries, cur.onsets, cfg.beatsPerBar, Math.min(3, fresh.laps.length)),
    }
  }, [fresh, multiLap, offset, cur, cfg])

  // 악보에 겹칠 표시
  const marks = useMemo(() => {
    if (phase === 'playing') {
      // 연습 중엔 이번 연습(반복이면 지금 바퀴)의 실시간 표시만 (녹음 안 하면 깨끗한 악보)
      if (!live) return undefined
      const m = new Map<number, HitMark>()
      for (const [idx, dev] of live.marks) m.set(idx, { dev })
      return m
    }
    if (!fresh) return undefined
    const m = new Map<number, HitMark>()
    if (lap) {
      for (const h of lap.match.hits) m.set(h.idx, { dev: h.dev === null ? null : h.dev - offset })
      return m
    }
    // '전체': 음표마다 바퀴 평균 (절반 넘게 놓쳤으면 놓침)
    const acc = new Map<number, { n: number; devs: number[] }>()
    for (const l of fresh.laps)
      for (const h of l.match.hits) {
        const a = acc.get(h.idx) ?? { n: 0, devs: [] }
        a.n++
        if (h.dev !== null) a.devs.push(h.dev)
        acc.set(h.idx, a)
      }
    for (const [idx, a] of acc) m.set(idx, { dev: a.devs.length && a.devs.length * 2 >= a.n ? Math.round((a.devs.reduce((x, y) => x + y, 0) / a.devs.length - offset) * 10) / 10 : null })
    return m
  }, [phase, live, fresh, lap, offset])
  const extras = useMemo(() => {
    if (!cfg) return undefined
    const spb = 60 / cfg.bpm
    if (phase === 'playing') {
      if (!live || !runRef.current) return undefined
      const base = (runRef.current.from - 1) * cfg.beatsPerBar
      return live.extras.map(t => base + t / spb)
    }
    if (!fresh || !lap) return undefined
    const base = (fresh.fromBar - 1) * cfg.beatsPerBar
    return lap.match.extras.map(t => base + t / spb)
  }, [cfg, phase, live, fresh, lap])

  // 자주 틀리는 곳 (같은 악보로 3번 이상 — 반복 연습은 한 바퀴가 한 번)
  const troubleData = useMemo(() => {
    if (!cur || !cfg) return null
    const rows = sessions
      .map(s => ({ s, d: decodeResult(s) }))
      .filter((x): x is { s: SessionRow; d: NonNullable<ReturnType<typeof decodeResult>> } => !!x.d && x.d.scoreHash === cur.hash)
    const recent = rows.slice(0, 10)
    const tries = sessionTries(recent)
    if (tries.length < 3) return { count: recent.length, tries: tries.length, troubles: null, trend: [] as number[] }
    return {
      count: recent.length,
      tries: tries.length,
      troubles: frequentTroubles(tries, cur.onsets, cfg.beatsPerBar),
      trend: recent.map(r => r.s.accuracy).reverse(),
    }
  }, [sessions, cur, cfg])
  const heat = useMemo(() => {
    if (!showHeat || !troubleData?.troubles) return undefined
    const h = new Map<number, number>()
    for (const t of troubleData.troubles) h.set(t.m, Math.min(1, (h.get(t.m) ?? 0) + 0.35))
    return h
  }, [showHeat, troubleData])

  const playhead = useCallback(() => (phase === 'playing' ? playerRef.current?.beatNow() ?? null : null), [phase])

  // ───────── 마디 미리 듣기 ─────────
  const playOrig = async (m: number) => {
    if (myPart === 'none' || phase !== 'idle') return
    const player = await getPlayer()
    audioRef.current?.stopAll()
    const dur = await player.previewBar(myPart, m)
    setPlayingKey(`orig-${m}`)
    setTimeout(() => setPlayingKey(k => (k === `orig-${m}` ? null : k)), dur * 1000)
  }
  // 반복 연습이면 고른 바퀴의 그 마디 (녹음 안에서 바퀴 k 는 k × 한 바퀴 길이만큼 뒤)
  const playMine = async (m: number) => {
    if (!take || !cfg || phase !== 'idle') return
    const lapK = take.loop ? (lapIdx ?? 0) : 0
    const audio = await getAudio()
    audio.stopAll()
    playerRef.current?.stop()
    const sr = audio.ctx.sampleRate
    const spb = 60 / cfg.bpm
    const barLen = cfg.beatsPerBar * spb
    const pre = barLen // 한 마디 카운트
    const segLen = pre + barLen + 0.4
    const t0 = (m - take.fromBar) * barLen - pre
    const clicks = new Float32Array(Math.ceil(segLen * sr))
    const ca = clickSamples(sr, 'accent')
    const cb = clickSamples(sr, 'beat')
    for (let b = 0; b <= cfg.beatsPerBar * 2; b++) {
      const at = Math.round(b * spb * sr)
      const src = b % cfg.beatsPerBar === 0 ? ca : cb
      for (let i = 0; i < src.length && at + i < clicks.length; i++) clicks[at + i] += src[i] * 0.35
    }
    if (!take.buffer) take.buffer = audio.makeBuffer([take.rec.samples])
    // 녹음은 지연만큼 늦게 들어와 있으니 그만큼 앞당겨 틀어야 클릭과 맞는다
    const off = take.gridOrigin + lapK * take.loopLen + t0 + take.latency - take.rec.startTime
    const seg = take.rec.samples.subarray(Math.max(0, Math.floor(off * sr)), Math.max(0, Math.floor((off + segLen) * sr)))
    let peak = 0
    for (const v of seg) peak = Math.max(peak, Math.abs(v))
    const gain = peak > 0 ? Math.min(8, 0.8 / peak) : 1
    const at = audio.ctx.currentTime + 0.08
    if (off >= 0) audio.play(take.buffer, at, off, segLen, gain)
    audio.play(audio.makeBuffer([clicks]), at)
    setPlayingKey(`mine-${m}`)
    setTimeout(() => setPlayingKey(k => (k === `mine-${m}` ? null : k)), (segLen + 0.2) * 1000)
  }

  const deleteSession = async (s: SessionRow) => {
    if (!myId) return
    const r = await fetch(`/api/practice/sessions/${s.id}?memberId=${encodeURIComponent(myId)}`, { method: 'DELETE' })
    if (r.ok) {
      setSessions(prev => prev.filter(x => x.id !== s.id))
      if (selSession === s.id) setSelSession(null)
    }
  }

  // ───────── 화면 ─────────
  if (error) {
    return (
      <main className="px-4 pt-6">
        <BackButton fallback="/practice" />
        <p className="text-zinc-500">{error}</p>
      </main>
    )
  }
  if (!song) {
    return (
      <main className="px-4 pt-6">
        <BackButton fallback="/practice" />
        <p className="text-zinc-500">불러오는 중…</p>
      </main>
    )
  }

  const total = cfg?.bars ?? 1
  const playing = phase === 'playing'
  const recordingNow = playing && !!runRef.current?.recording
  const loopingNow = playing && !!runRef.current?.loop
  const pickingNow = picking && !playing
  // 구간 고르는 중엔 곡 전체를 펼쳐 놓는다
  const scoreFrom = playing && runRef.current ? runRef.current.from : pickingNow ? 1 : fresh ? fresh.fromBar : range.from
  const scoreTo = playing && runRef.current ? runRef.current.to : pickingNow ? total : fresh ? fresh.toBar : range.to
  const scoreRange = playing
    ? null
    : pickingNow
      ? pickAnchor !== null
        ? { from: pickAnchor, to: pickAnchor }
        : range
      : range.from > scoreFrom || range.to < scoreTo
        ? range
        : null
  const recordOn = record && myPart !== 'none'
  const rangeText = range.from === range.to ? `${range.from}마디` : `${range.from}~${range.to}마디`
  const lapTitle = fresh ? (multiLap ? (lapIdx === null ? `${fresh.title} · 전체 ${fresh.laps.length}바퀴` : `${fresh.title} · ${lapIdx + 1}바퀴째`) : fresh.title) : ''

  return (
    <main className="px-4 pt-6">
      <BackButton fallback="/practice" />
      <h1 className="text-2xl font-bold">{song.title}</h1>
      <p className="mt-0.5 text-sm text-zinc-500">
        {song.artist}
        {cfg && ` · ${cfg.bpm} BPM · ${cfg.bars}마디`}
      </p>

      {!cfg || parts.length === 0 ? (
        <section className="mt-5 rounded-2xl bg-surface p-5 text-sm text-zinc-500">
          이 곡은 아직 파트별 연습 음원이 없어요. 악보를 바탕으로 만들어지면 여기서 파트를 골라 같이 칠 수 있어요.
        </section>
      ) : (
        <>
          {/* 설정 (연습 중엔 접는다) */}
          {!playing && (
            <section className="mt-5 space-y-4 rounded-2xl bg-surface p-4">
              <div>
                <div className="text-xs font-semibold text-zinc-500">내가 치는 파트 (악보·박자 체크)</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {scoredParts.map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => chooseMyPart(k)}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold ${myPart === k ? 'bg-brand text-white' : 'bg-surface-2 text-zinc-700'}`}
                    >
                      {partInfo(k).emoji} {partInfo(k).label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => chooseMyPart('none')}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold ${myPart === 'none' ? 'bg-brand text-white' : 'bg-surface-2 text-zinc-700'}`}
                  >
                    🎧 듣기만
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-baseline justify-between">
                  <div className="text-xs font-semibold text-zinc-500">같이 틀 소리</div>
                  <button type="button" onClick={() => setShowMixer(v => !v)} className="text-xs font-semibold text-brand">
                    {showMixer ? '음량 닫기' : '음량 조절'}
                  </button>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {parts.map(k => {
                    const on = !!enabled[k]
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => toggle(k)}
                        aria-pressed={on}
                        className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[13px] font-semibold ${on ? 'bg-brand text-white' : 'bg-surface-2 text-zinc-500'}`}
                      >
                        <span className={`text-xl ${on ? '' : 'opacity-40 grayscale'}`}>{partInfo(k).emoji}</span>
                        {partInfo(k).label}
                        {k === myPart && <span className="text-[10px] opacity-80">(내 파트)</span>}
                      </button>
                    )
                  })}
                </div>
                {showMixer && (
                  <div className="mt-2 space-y-2">
                    {parts.map(k => (
                      <label key={k} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 truncate">
                          {partInfo(k).emoji} {partInfo(k).label}
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={volume[k] ?? 1}
                          onChange={e => {
                            const v = Number(e.target.value)
                            setVolume(prev => ({ ...prev, [k]: v }))
                            playerRef.current?.setVolume(k, v)
                          }}
                          className="min-w-0 flex-1 accent-[#7c3aed]"
                        />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">{Math.round((volume[k] ?? 1) * 100)}%</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-zinc-500">구간</span>
                  <BarSelect value={range.from} max={total} label="시작 마디" onChange={v => setRange(r => ({ from: v, to: Math.max(v, r.to) }))} />
                  <span className="text-zinc-500">~</span>
                  <BarSelect value={range.to} max={total} label="끝 마디" onChange={v => setRange(r => ({ to: v, from: Math.min(v, r.from) }))} />
                  <span className="text-zinc-500">마디</span>
                </div>
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} className="h-4 w-4 accent-[#7c3aed]" />
                  반복
                </label>
              </div>
              {(range.from !== 1 || range.to !== total) && (
                <button type="button" onClick={() => setRange({ from: 1, to: total })} className="-mt-2 text-xs text-brand">
                  처음부터 끝까지로
                </button>
              )}
              {loop && recordOn && (
                <p className="-mt-2 text-[11px] leading-relaxed text-zinc-500">
                  🔁 고른 마디를 멈출 때까지 계속 돌아요. 바퀴마다 박자를 체크하고, 그만두면 바퀴별로 분석해 기록 하나로 저장해요 (최대 40바퀴·10분).
                </p>
              )}

              {myPart !== 'none' && (
                <div className="rounded-xl bg-surface-2 p-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="min-w-0 text-sm">
                      <b>🎙 녹음해서 박자 체크</b>
                      <span className="block text-xs text-zinc-500">치는 대로 악보에 바로 표시하고, 끝나면 분석해서 기록으로 저장해요</span>
                    </span>
                    <input type="checkbox" checked={record} onChange={e => setRecord(e.target.checked)} className="h-6 w-6 shrink-0 accent-[#7c3aed]" />
                  </label>
                  {record && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-200 pt-2">
                      <div className="min-w-0 text-xs text-zinc-500">
                        소리 지연 보정:{' '}
                        {latency ? (
                          <b className="text-zinc-800">{latency.ms}ms</b>
                        ) : (
                          <span>아직 안 했어요 (안 하면 &lsquo;내 평균 기준&rsquo;으로만 비교)</span>
                        )}
                      </div>
                      <button type="button" onClick={calibrate} disabled={phase !== 'idle'} className="shrink-0 rounded-lg bg-surface px-3 py-1.5 text-xs font-semibold text-brand disabled:opacity-50">
                        {phase === 'calibrating' ? '듣는 중…' : latency ? '다시 측정' : '측정하기'}
                      </button>
                    </div>
                  )}
                  {record && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                      🎧 이어폰으로 들으며 치세요. 지연 측정은 이어폰을 낀 채 한쪽을 폰 마이크(아래쪽)에 대고 하면 돼요 (딸깍 8번).
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {message && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{message}</p>}

          {/* 시작 / 진행 */}
          <section className={`sticky top-2 z-30 mt-4 rounded-2xl p-3 shadow-sm ${recordingNow ? 'bg-zinc-900 text-white' : 'bg-surface'}`}>
            {phase === 'analyzing' ? (
              <div>
                <div className="text-center text-sm font-semibold">연습 분석 중… {Math.round(progress * 100)}%</div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress * 100}%` }} />
                </div>
              </div>
            ) : playing ? (
              <div>
                <div className="flex items-center gap-3">
                  {recordingNow && <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />}
                  <PosText player={playerRef.current} beatsPerBar={cfg.beatsPerBar} total={total} loop={loopingNow} />
                  <button type="button" onClick={stop} className={`ml-auto shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold ${recordingNow ? 'bg-white/15' : 'bg-zinc-900 text-white'}`}>
                    ■ {recordingNow ? '그만 (분석)' : '정지'}
                  </button>
                </div>
                {recordingNow && loopingNow && live && live.laps.length > 0 && <LiveLapChips laps={live.laps} />}
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => start()}
                  disabled={phase !== 'idle'}
                  className="flex-1 rounded-xl bg-brand py-3.5 text-base font-bold text-white active:bg-brand-dark disabled:opacity-50"
                >
                  {loop
                    ? `${recordOn ? '●' : '▶'} 🔁 ${rangeText} 반복${recordOn ? ' (녹음)' : ''}`
                    : `${recordOn ? '● 연습하기 (녹음)' : '▶ 연습하기'} · ${rangeText}`}
                </button>
                {/* 녹음하며 반복할 땐 구간이 몰래 바뀌지 않게 숨긴다 */}
                {!(loop && recordOn) && lastBar && lastBar > range.from && lastBar <= range.to && (
                  <button type="button" onClick={() => start({ from: lastBar, to: range.to, loop })} className="shrink-0 rounded-xl bg-surface-2 px-3 text-sm font-semibold text-brand">
                    {lastBar}마디부터
                  </button>
                )}
              </div>
            )}
          </section>

          {/* 악보 */}
          {myPart !== 'none' && (
            <section ref={scoreRef} className="mt-3 scroll-mt-24 rounded-2xl bg-surface px-1 py-3">
              <div className="flex items-center justify-between gap-2 px-3">
                <h2 className="shrink-0 text-base font-semibold">
                  {partInfo(myPart).emoji} {partInfo(myPart).label} 악보
                </h2>
                {playing ? (
                  <span className="truncate text-[11px] text-zinc-500">{recordingNow && loopingNow ? '바퀴마다 새로 표시해요' : '진행선을 따라 치세요'}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setPicking(v => !v)
                      setPickAnchor(null)
                    }}
                    aria-pressed={picking}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${picking ? 'bg-brand text-white' : 'bg-surface-2 text-brand'}`}
                  >
                    {picking ? '✓ 다 골랐어요' : '🔁 구간 고르기'}
                  </button>
                )}
              </div>
              {pickingNow && (
                <p className="mx-3 mt-2 rounded-xl bg-brand/10 px-3 py-2 text-xs leading-relaxed text-brand">
                  {pickAnchor === null ? (
                    <>
                      <b>{rangeText}</b> 골랐어요 · 다시 고르려면 시작 마디를 누르세요
                    </>
                  ) : (
                    <>
                      <b>{pickAnchor}마디</b>부터 · 끝 마디를 누르세요 (같은 마디를 한 번 더 누르면 그 마디만)
                    </>
                  )}
                </p>
              )}
              {!playing && !pickingNow && lapTitle && <p className="mt-0.5 truncate px-3 text-right text-[11px] text-zinc-500">{lapTitle}</p>}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-900" /> 악보 (정확하면 그대로)
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: EARLY, opacity: 0.6 }} /> 빨리 친 소리
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: LATE, opacity: 0.6 }} /> 늦게 친 소리
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full border border-dashed border-zinc-400" /> 놓침
                </span>
                <span>· 차이는 {EXAG}배로 키워서 보여줘요</span>
              </div>
              {view?.stale && <p className="mt-2 px-3 text-xs text-amber-700">이 기록은 악보가 바뀌기 전에 한 거라 악보 위에 표시할 수 없어요.</p>}
              <div className="mt-2">
                {cur ? (
                  <ScoreView
                    score={cur.score}
                    onsets={cur.onsets}
                    bpm={cfg.bpm}
                    beatsPerBar={cfg.beatsPerBar}
                    fromBar={scoreFrom}
                    toBar={scoreTo}
                    marks={marks}
                    extras={extras}
                    heat={heat}
                    selectedBar={playing || pickingNow ? null : selectedBar}
                    onSelectBar={playing ? undefined : pickingNow ? pickBar : m => setSelectedBar(m)}
                    playhead={playhead}
                    follow={playing}
                    range={scoreRange}
                  />
                ) : (
                  <p className="px-3 py-6 text-center text-sm text-zinc-500">악보 불러오는 중…</p>
                )}
              </div>
            </section>
          )}

          {/* 피드백 (반복 연습이면 바퀴 고르기 + 전체/바퀴별) */}
          {!playing && fresh && raw && (summary || overview) && (
            <div id="feedback" className="mt-4 scroll-mt-24 space-y-2">
              {multiLap && overview && (
                <LapChips
                  laps={overview.lapAcc}
                  mean={overview.mean}
                  selected={lapIdx === null ? 'all' : lapIdx}
                  onSelect={v => setLapSel(v)}
                />
              )}
              {lap && summary ? (
                <Feedback
                  title={lapTitle}
                  summary={summary}
                  relative={relative}
                  calibrated={fresh.calibrated}
                  rawMedian={raw.medianDev}
                  onToggleRelative={v => setRelativePick(v)}
                  hits={lap.match.hits}
                  selectedBar={selectedBar}
                  onSelectBar={m => {
                    setSelectedBar(m)
                    scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  onPlayOrig={myPart !== 'none' ? playOrig : undefined}
                  onPlayMine={fresh.current ? playMine : undefined}
                  canPlayMine={!!take && fresh.current}
                  onLoopBar={loopBar}
                  playing={playingKey}
                />
              ) : (
                overview && (
                  <LapOverview
                    title={lapTitle}
                    lapAcc={overview.lapAcc}
                    mean={overview.mean}
                    pooled={overview.pooled}
                    troubles={overview.troubles}
                    relative={relative}
                    calibrated={fresh.calibrated}
                    rawMedian={raw.medianDev}
                    onToggleRelative={v => setRelativePick(v)}
                    lapHits={fresh.laps.map(l => l.match.hits)}
                    selectedBar={selectedBar}
                    onSelectBar={m => {
                      setSelectedBar(m)
                      scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                    onSelectLap={k => setLapSel(k)}
                    onPlayOrig={myPart !== 'none' ? playOrig : undefined}
                    onLoopBar={loopBar}
                    playing={playingKey}
                  />
                )
              )}
            </div>
          )}

          {!playing && myPart !== 'none' && troubleData?.troubles && (
            <div className="mt-4">
              <Troubles
                troubles={troubleData.troubles}
                count={troubleData.count}
                tries={troubleData.tries}
                trend={troubleData.trend}
                showHeat={showHeat}
                onToggleHeat={setShowHeat}
                onSelectBar={m => {
                  setSelectedBar(m)
                  setShowHeat(true)
                  scoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }}
                onLoopBar={loopBar}
              />
            </div>
          )}
          {!playing && myPart !== 'none' && troubleData && !troubleData.troubles && troubleData.count > 0 && (
            <p className="mt-3 text-center text-xs text-zinc-500">연습을 {3 - troubleData.tries}번 더 하면 자주 틀리는 곳을 짚어 드려요.</p>
          )}

          {!playing && myPart !== 'none' && (
            <div className="mt-4">
              <SessionList
                sessions={sessions}
                selectedId={selSession ?? take?.sessionId ?? null}
                onSelect={s => {
                  setSelSession(s.id)
                  setRelativePick(null)
                  const d = decodeResult(s)
                  setLapSel(d && d.loop && d.laps.length > 1 ? 'all' : 0)
                  if (d && cur && d.scoreHash === cur.hash && cfg) {
                    const laps = sessionLaps(s, d, cur.onsets, cfg.beatsPerBar)
                    const sum = summarize(mergeLaps(laps), s.fromBar, s.toBar, s.calibrated ? 0 : s.medianDev)
                    setSelectedBar(sum.worst[0] ?? null)
                  }
                  setTimeout(() => document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
                }}
                onDelete={deleteSession}
              />
            </div>
          )}
        </>
      )}

      {/* 악보 원본·튜너 */}
      <section className="mt-4 rounded-2xl bg-surface p-4">
        <h2 className="text-base font-semibold">원본 악보 · 튜너</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {song.sheets.map(s => (
            <Link key={s.id} href={`/songs/${song.id}/sheet/${s.id}`} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
              {partEmoji(s.part)} {s.part}
            </Link>
          ))}
          <Link href="/practice/tuner" className="rounded-full bg-surface-2 px-3 py-1.5 text-sm">
            🎚️ 튜너
          </Link>
        </div>
      </section>
    </main>
  )
}

// 지금 마디 (자주 바뀌니 따로 그린다). 반복이면 몇 바퀴째인지도
function PosText({ player, beatsPerBar, total, loop }: { player: StemPlayer | null; beatsPerBar: number; total: number; loop: boolean }) {
  const [txt, setTxt] = useState('준비…')
  const [lap, setLap] = useState(1)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = player?.position()
      if (!p) return
      setTxt(p.bar === 0 ? `준비… ${p.countIn || ''}` : `${Math.min(p.bar, total)}마디 ${p.beat + 1}박`)
      setLap(p.lap)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [player, beatsPerBar, total])
  if (!loop) return <span className="text-lg font-extrabold tabular-nums">{txt}</span>
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="text-xs font-bold tabular-nums opacity-80" data-testid="lap-now">
        🔁 {lap}바퀴째
      </span>
      <span className="text-lg font-extrabold tabular-nums">{txt}</span>
    </span>
  )
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

function errorText(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return '마이크 권한이 꺼져 있어요. 브라우저(또는 설정 → 사파리 → 마이크)에서 허용해 주세요.'
  if (name === 'NotFoundError') return '마이크를 찾지 못했어요.'
  return (e as Error)?.message || '오디오를 시작하지 못했어요.'
}

function BarSelect({ value, max, onChange, label }: { value: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={e => onChange(Number(e.target.value))}
      className="rounded-lg bg-surface-2 px-2 py-1.5 text-base tabular-nums text-zinc-900 outline-none"
    >
      {Array.from({ length: max }, (_, i) => i + 1).map(n => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  )
}

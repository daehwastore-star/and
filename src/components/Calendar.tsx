'use client'

import { useEffect, useState } from 'react'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function kstDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

export default function Calendar({
  eventDates,
  selected,
  onSelect,
}: {
  eventDates: string[]
  selected?: string | null // 'YYYY-MM-DD' — 넘기면 선택 모드
  onSelect?: (dateStr: string) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [cursor, setCursor] = useState(() => {
    const today = new Date()
    return { year: today.getFullYear(), month: today.getMonth() }
  })

  useEffect(() => {
    const today = new Date()
    setCursor({ year: today.getFullYear(), month: today.getMonth() })
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className="h-72 rounded-2xl bg-surface" />
  }

  const events = new Set(eventDates.map(d => kstDateStr(new Date(d))))
  const todayStr = kstDateStr(new Date())
  const selectable = onSelect !== undefined

  const first = new Date(cursor.year, cursor.month, 1)
  const startWeekday = first.getDay()
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()

  const cells: (number | null)[] = [
    ...Array<null>(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStrOf = (day: number) =>
    `${cursor.year}-${pad(cursor.month + 1)}-${pad(day)}`

  const move = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          className="h-8 w-8 rounded-lg bg-surface-2 text-zinc-500"
        >
          ‹
        </button>
        <span className="font-semibold">
          {cursor.year}년 {cursor.month + 1}월
        </span>
        <button
          type="button"
          onClick={() => move(1)}
          className="h-8 w-8 rounded-lg bg-surface-2 text-zinc-500"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-xs text-zinc-500">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? 'text-red-400' : ''}`}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 text-center">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="py-2" />
          const ds = dateStrOf(day)
          const hasEvent = events.has(ds)
          const isToday = ds === todayStr
          const isSelected = selected === ds
          const isPast = ds < todayStr

          const circle = isSelected
            ? 'bg-brand font-bold text-white'
            : isToday
              ? 'ring-2 ring-brand font-bold text-brand'
              : i % 7 === 0
                ? 'text-red-400'
                : ''

          const inner = (
            <>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm ${circle} ${
                  selectable && isPast ? 'opacity-35' : ''
                }`}
              >
                {day}
              </span>
              <span
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  hasEvent ? 'bg-brand' : 'bg-transparent'
                }`}
              />
            </>
          )

          if (selectable && !isPast) {
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(ds)}
                className="flex flex-col items-center py-1.5"
              >
                {inner}
              </button>
            )
          }
          return (
            <div key={i} className="flex flex-col items-center py-1.5">
              {inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}

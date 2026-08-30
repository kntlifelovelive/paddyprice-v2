/**
 * 3x3 pattern pad — touch & mouse-friendly. The draw order (sequence of dot
 * indices) is the secret; the user can lift and start over before submitting.
 */
import { useState } from 'react'
import { cn } from '@/shared/ui'

interface PatternPadProps {
  size?: number
  onSubmit(points: number[]): void
  disabled?: boolean
}

const DOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8]

export function PatternPad({ size = 240, onSubmit, disabled = false }: PatternPadProps): JSX.Element {
  const [points, setPoints] = useState<number[]>([])
  const [drawing, setDrawing] = useState(false)

  const cell = Math.floor(size / 3)
  const dotSize = 18
  const dotPos = (idx: number): { x: number; y: number } => {
    const col = idx % 3
    const row = Math.floor(idx / 3)
    return { x: col * cell + cell / 2, y: row * cell + cell / 2 }
  }

  function getDotFromEvent(evt: React.PointerEvent<SVGSVGElement>): number | null {
    const rect = evt.currentTarget.getBoundingClientRect()
    const x = ((evt.clientX - rect.left) / rect.width) * size
    const y = ((evt.clientY - rect.top) / rect.height) * size
    let bestIdx: number | null = null
    let bestDist = Infinity
    for (const idx of DOTS) {
      const p = dotPos(idx)
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < cell / 2 && d < bestDist) {
        bestIdx = idx
        bestDist = d
      }
    }
    return bestIdx
  }

  function handleDown(evt: React.PointerEvent<SVGSVGElement>): void {
    if (disabled) return
    evt.preventDefault()
    const idx = getDotFromEvent(evt)
    if (idx === null) return
    evt.currentTarget.setPointerCapture(evt.pointerId)
    setDrawing(true)
    setPoints([idx])
  }

  function handleMove(evt: React.PointerEvent<SVGSVGElement>): void {
    if (!drawing || disabled) return
    const idx = getDotFromEvent(evt)
    if (idx === null) {
  // hover state removed (unused after simplication)
      return
    }
// hover state removed
    if (!points.includes(idx)) {
      setPoints((prev) => [...prev, idx])
    }
  }

  function handleUp(evt: React.PointerEvent<SVGSVGElement>): void {
    if (!drawing) return
    setDrawing(false)
// hover state removed (unused after simplication)
    try { evt.currentTarget.releasePointerCapture(evt.pointerId) } catch { /* noop */ }
    if (points.length >= 4) {
      onSubmit([...points])
    }
    setPoints([])
  }

  const pathD = (() => {
    if (points.length === 0) return null
    const segs: string[] = []
    for (let i = 0; i < points.length; i += 1) {
      const p = dotPos(points[i])
      segs.push(`${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    }
    return segs.join(' ')
  })()

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        className={cn('touch-none select-none', disabled ? 'opacity-50' : 'cursor-crosshair')}
        aria-label="Pattern lock"
        role="application"
      >
        {pathD && <path d={pathD} stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-accent" />}
        {DOTS.map((idx) => {
          const p = dotPos(idx)
          const isActive = points.includes(idx)
          return (
            <g key={idx}>
              <circle cx={p.x} cy={p.y} r={dotSize} className={isActive ? 'fill-accent' : 'fill-border'} stroke="none" />
              {isActive && <circle cx={p.x} cy={p.y} r={6} className="fill-accent-text" />}
            </g>
          )
        })}
      </svg>
      <div className="text-xs text-content-muted">
        {points.length === 0 ? 'Draw pattern (≥ 4 dots)' : `${points.length} dot${points.length === 1 ? '' : 's'} — release to submit`}
      </div>
    </div>
  )
}

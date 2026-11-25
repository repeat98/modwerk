import { useRef, type CSSProperties } from 'react'

export function ZoomParameterInput({ name, value, max, choices, disabled, onChange }: {
  name: string
  value: number
  max: number
  choices?: readonly (readonly [label: string, through: number])[]
  disabled: boolean
  onChange: (value: number) => void
}) {
  const drag = useRef<{ pointer: number; y: number; value: number } | null>(null)
  if (choices?.length) {
    const selected = choices.findIndex(([, through]) => value <= through)
    return <label className="zoom-parameter zoom-parameter-choice">
      <span>{name}</span>
      <select disabled={disabled} value={selected} onChange={event => {
        const index = Number(event.currentTarget.value), first = index ? choices[index - 1][1] + 1 : 0
        onChange(Math.floor((first + choices[index][1]) / 2))
      }}>
        {choices.map(([label], index) => <option key={index} value={index}>{label}</option>)}
      </select>
    </label>
  }
  return <label className="zoom-parameter">
    <span>{name}</span>
    <span className="zoom-parameter-dial" style={{ '--rotation': `${-140 + 280 * value / max}deg` } as CSSProperties}>
      <input type="range" min={0} max={max} value={value} disabled={disabled} aria-label={name}
        onChange={event => onChange(event.currentTarget.valueAsNumber)}
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return
          event.preventDefault()
          event.currentTarget.focus()
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { pointer: event.pointerId, y: event.clientY, value }
        }}
        onPointerMove={event => {
          const start = drag.current
          if (!start || start.pointer !== event.pointerId) return
          const next = Math.round(start.value + (start.y - event.clientY) * max / 180)
          onChange(Math.max(0, Math.min(max, next)))
        }}
        onLostPointerCapture={() => { drag.current = null }} />
    </span>
    <span className="zoom-parameter-value">{value}</span>
  </label>
}

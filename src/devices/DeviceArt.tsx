import type { DeviceArt as Art } from './registry'

// Original schematic line art: a generic box with a screen, encoders, keys and pads. Not a likeness of any product.
export function DeviceArt({ art, label }: { art: Art; label?: string }) {
  if (art.body === 'pedal') return <PedalArt art={art} label={label} />
  const width = art.body === 'compact' ? 200 : art.body === 'box' ? 150 : art.body === 'model' ? 180 : 240
  const keys = art.body === 'keys'
  const height = keys ? 150 : art.body === 'box' ? 120 : 120
  const x0 = (240 - width) / 2, y0 = (160 - height) / 2
  const inner = width - 24
  const screenWidth = art.body === 'box' ? 44 : art.body === 'model' ? 36 : 54
  const encoderStep = art.encoders ? Math.min(18, (inner - screenWidth - 14) / Math.ceil(art.encoders / 2)) : 0
  const trigStep = art.trigs ? inner / art.trigs : 0
  return (
    <svg className="device-art" viewBox="0 0 240 160" fill="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect className="device-body" x={x0} y={y0} width={width} height={height} rx="7" />
      <rect className="device-screen" x={x0 + 12} y={y0 + 12} width={screenWidth} height="26" rx="2" />
      <path className="device-screen-line" d={`M${x0 + 17} ${y0 + 30}h${screenWidth * .35}l6-9 6 13 5-6h${screenWidth * .2}`} />
      {Array.from({ length: art.encoders }, (_, i) => {
        const row = i % 2, col = Math.floor(i / 2)
        return <circle key={'e' + i} className="device-encoder" cx={x0 + 12 + screenWidth + 16 + col * encoderStep} cy={y0 + 17 + row * 16} r="5" />
      })}
      {Array.from({ length: art.knobs ?? 0 }, (_, i) => {
        const perRow = art.body === 'box' ? 4 : art.knobs!
        const step = art.body === 'box' ? (inner - 8) / perRow : 16
        const startX = art.body === 'box' ? x0 + 12 + step / 2 + 4 : x0 + width - 12 - art.knobs! * 16 + 8
        const startY = art.body === 'box' ? y0 + 58 : y0 + 50
        return <circle key={'k' + i} className="device-knob" cx={startX + (i % perRow) * step} cy={startY + Math.floor(i / perRow) * 28} r={art.body === 'box' ? 9 : 5.5} />
      })}
      {Array.from({ length: art.pads ?? 0 }, (_, i) => {
        const perRow = art.pads === 12 ? 6 : 6
        const size = art.body === 'model' ? 18 : 12
        const gap = art.body === 'model' ? 6 : 4
        const startX = art.body === 'model' ? x0 + 12 : x0 + width - 12 - perRow * (size + gap) + gap
        const startY = art.body === 'model' ? y0 + 50 : y0 + 50
        return <rect key={'p' + i} className="device-pad" x={startX + (i % perRow) * (size + gap)} y={startY + Math.floor(i / perRow) * (size + gap)} width={size} height={size} rx="2" />
      })}
      {art.fader && <g className="device-fader"><path d={`M${x0 + 18} ${y0 + 62}h46`} /><rect x={x0 + 34} y={y0 + 56} width="12" height="12" rx="2" /></g>}
      {Array.from({ length: art.trigs }, (_, i) => <rect key={'t' + i} className={'device-trig' + (i % 4 === 0 ? ' is-beat' : '')} x={x0 + 12 + i * trigStep + 1} y={y0 + height - (keys ? 52 : 22)} width={Math.max(3, trigStep - 3)} height={art.body === 'model' ? 6 : 8} rx="1.5" />)}
      {keys && <g className="device-keys">{Array.from({ length: 22 }, (_, i) => <rect key={i} x={x0 + 12 + i * (inner / 22)} y={y0 + height - 38} width={inner / 22} height="28" />)}</g>}
    </svg>
  )
}

// A generic floor pedal seen from above: a small screen, a row of knobs and a footswitch at the bottom.
function PedalArt({ art, label }: { art: Art; label?: string }) {
  const knobs = art.knobs ?? 3, width = 70 + knobs * 34, height = 120, x0 = (240 - width) / 2, y0 = (160 - height) / 2
  const switches = 1, switchStep = width
  return (
    <svg className="device-art" viewBox="0 0 240 160" fill="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect className="device-body" x={x0} y={y0} width={width} height={height} rx="9" />
      <rect className="device-screen" x={x0 + 14} y={y0 + 14} width={width - 28} height="22" rx="2" />
      <path className="device-screen-line" d={`M${x0 + 20} ${y0 + 28}h${(width - 40) * .3}l6-8 6 12 5-6h${(width - 40) * .3}`} />
      {Array.from({ length: knobs }, (_, i) => <circle key={'k' + i} className="device-knob" cx={x0 + width / 2 + (i - (knobs - 1) / 2) * 34} cy={y0 + 58} r="9" />)}
      {Array.from({ length: switches }, (_, i) => <circle key={'s' + i} className="device-encoder" cx={x0 + switchStep * (i + .5)} cy={y0 + 100} r="10" />)}
    </svg>
  )
}

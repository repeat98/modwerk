import type { DeviceArt as Art } from './registry'

// Original schematic line art: a generic box with a screen, encoders, keys and pads. Not a likeness of any product.
export function DeviceArt({ art, label }: { art: Art; label?: string }) {
  if (art.body === 'pedal') return <StompArt art={art} label={label} />
  if (art.body === 'floor') return <FloorArt label={label} />
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

// A MultiStomp-style stompbox seen from above, in its real proportions: a screen showing the parameter dials, a strip of
// knobs, a status LED and one footswitch in its ring. No logos or printed panel graphics.
function StompArt({ art, label }: { art: Art; label?: string }) {
  const knobs = art.knobs ?? 3, w = 88, h = 146, x0 = (240 - w) / 2, y0 = (160 - h) / 2, cx = 120, cy = y0 + 112
  return (
    <svg className="device-art" viewBox="0 0 240 160" fill="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path className="device-body" d={`M${x0 + 9} ${y0}H${x0 + w - 9}L${x0 + w} ${y0 + 9}V${y0 + h - 6}Q${x0 + w} ${y0 + h} ${x0 + w - 6} ${y0 + h}H${x0 + 6}Q${x0} ${y0 + h} ${x0} ${y0 + h - 6}V${y0 + 9}Z`} />
      <rect className="device-screen" x={cx - 26} y={y0 + 12} width="52" height="32" rx="2" />
      {Array.from({ length: knobs }, (_, i) => { const x = cx + (i - (knobs - 1) / 2) * 15, y = y0 + 29, a = [-.7, .4, 1.1][i % 3]; return <path key={'d' + i} className="device-screen-line" d={`M${x - 3.5} ${y + 3.5}A5 5 0 1 1 ${x + 3.5} ${y + 3.5}M${x} ${y}l${(4 * Math.sin(a)).toFixed(2)} ${(-4 * Math.cos(a)).toFixed(2)}`} /> })}
      <rect className="device-panel" x={x0 + 4} y={y0 + 51} width={w - 8} height="20" rx="3" />
      {Array.from({ length: knobs }, (_, i) => <circle key={'k' + i} className="device-knob" cx={x0 + w * (i + .5) / knobs} cy={y0 + 61} r="7" />)}
      <circle className="device-led" cx={x0 + 19} cy={y0 + 94} r="2.2" />
      <circle className="device-pad" cx={cx} cy={cy} r="22" />
      <path className="device-panel" d={[45, 135, 225, 315].map(deg => { const r = deg * Math.PI / 180; return `M${(cx + 13 * Math.cos(r)).toFixed(2)} ${(cy + 13 * Math.sin(r)).toFixed(2)}L${(cx + 22 * Math.cos(r)).toFixed(2)} ${(cy + 22 * Math.sin(r)).toFixed(2)}` }).join('')} />
      <circle className="device-encoder" cx={cx} cy={cy} r="10" />
    </svg>
  )
}

// A two-footswitch floor unit seen from above (G1on layout): screen, parameter knob and keys on the left, a cursor pad and
// two keys on the right, and two ridged footswitch plates below. No logos or printed panel graphics.
function FloorArt({ label }: { label?: string }) {
  const w = 140, h = 148, x0 = (240 - w) / 2, y0 = (160 - h) / 2, mid = x0 + w / 2, split = y0 + 72, row = y0 + 59
  const ridges = (x: number, narrowing: boolean) => Array.from({ length: 6 }, (_, i) => { const width = narrowing ? 46 - i * 6.4 : 14 + i * 6.4; return <rect key={x + '-' + i} className="device-panel" x={x - width / 2} y={split + 14 + i * 9.5} width={width} height="4" rx="2" /> })
  return (
    <svg className="device-art" viewBox="0 0 240 160" fill="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <rect className="device-body" x={x0} y={y0} width={w} height={h} rx="6" />
      <path className="device-body" d={`M${mid} ${y0}V${y0 + h}M${x0} ${split}H${x0 + w}`} />
      <rect className="device-screen" x={x0 + 15} y={y0 + 16} width="40" height="30" rx="2" />
      <path className="device-screen-line" d={`M${x0 + 20} ${y0 + 34}h10l5-8 5 12 4-6h6`} />
      <circle className="device-encoder" cx={x0 + 17} cy={row} r="5.5" />
      <circle className="device-knob" cx={x0 + 35} cy={row} r="8" />
      <circle className="device-encoder" cx={x0 + 53} cy={row} r="5.5" />
      <rect className="device-pad" x={x0 + 90} y={y0 + 16} width="30" height="30" rx="4" />
      <path className="device-panel" d={`M${x0 + 92} ${y0 + 18}l26 26M${x0 + 118} ${y0 + 18}l-26 26`} />
      <circle className="device-encoder" cx={x0 + 92} cy={row} r="5.5" />
      <circle className="device-encoder" cx={x0 + 118} cy={row} r="5.5" />
      {ridges(x0 + 35, true)}
      {ridges(x0 + 105, false)}
    </svg>
  )
}

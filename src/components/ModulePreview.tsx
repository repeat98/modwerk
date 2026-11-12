import type { ReactElement } from 'react'
import { DETAILS } from '../catalog/details.ts'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents.ts'
import { assetUrl } from '../hosting.ts'

function sine(offset: number, amplitude = 30, frequency = 2.2) {
  return Array.from({ length: 121 }, (_, i) => {
    const x = 28 + i * 2.2
    const y = 97 + Math.sin(i / 120 * Math.PI * 2 * frequency + offset) * amplitude
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }).join(' ')
}

function muteSignal(mode: number) {
  return Array.from({ length: 121 }, (_, i) => {
    const x = 80 + i * 1.76
    const afterMute = Math.max(0, x - 160)
    const envelope = x < 160 ? 11 : mode === 0 ? 0 : mode === 1 ? 6
      : mode === 2 ? 8 * Math.exp(-afterMute / 28) : 11 * Math.max(0, 1 - afterMute / 75)
    const y = 48 + mode * 31 + Math.sin(i * .6) * envelope
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }).join(' ')
}

function recorderSignal() {
  return Array.from({ length: 121 }, (_, i) => {
    const x = 28 + i * 2.2
    const phase = i / 40 * Math.PI * 2
    const y = 85 + Math.sin(phase) * 29 + Math.sin(phase * 2) * 8
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }).join(' ')
}

function polyVoice(voice: number) {
  const center = 47 + voice * 14
  const periods = 2.5 * 2 ** (voice / 7)
  return Array.from({ length: 81 }, (_, i) => {
    const x = 125 + i * 2
    const envelope = Math.min(i / 7, 1, (80 - i) / 9)
    const y = center + Math.sin(i / 80 * Math.PI * 2 * periods) * 4.2 * envelope
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)
  }).join(' ')
}

// The Amiga computer seen from the front right: u runs across the case, v from back to front, z up; the top slopes down to the front.
function amigaPoint(u: number, v: number, z = 26 - 16 * v / 92) {
  return (75 + .94 * u - .4 * v).toFixed(1) + ' ' + (70 + .11 * u + .4 * v - z).toFixed(1)
}
const amigaPath = (points: [number, number, number?][], close = true) => 'M' + points.map(([u, v, z]) => amigaPoint(u, v, z)).join('L') + (close ? 'Z' : '')
const amigaQuad = ([u0, v0, u1, v1]: number[], gap = 1.6) => amigaPath([[u0, v0], [u1 - gap, v0], [u1 - gap, v1 - gap], [u0, v1 - gap]])

function amigaKeys() {
  const k = 9, h = 8.2, top = 33, right = 141, cursor = 146, pad = 178, keys = [[6, 24, 15, 30]]
  for (let i = 0; i < 10; i++) keys.push([22 + (i > 4 ? 64 : 0) + (i % 5) * 12.4, 24, 34.4 + (i > 4 ? 64 : 0) + (i % 5) * 12.4, 30])
  ;[k, 1.5 * k, 1.75 * k, 2.25 * k].forEach((lead, row) => {
    const v = top + row * h
    let u = 6 + lead
    keys.push([6, v, u, v + h])
    for (; u + k <= right - (row ? k / 2 : 0) + .01; u += k) keys.push([u, v, u + k, v + h])
    if (right - u > 2) keys.push([u, v, right, v + h])
  })
  for (const [a, b] of [[0, 1.5], [1.5, 2.5], [2.5, 12.5], [12.5, 13.5], [13.5, 15]]) keys.push([6 + a * k, top + 4 * h, 6 + b * k, top + 5 * h])
  keys.push([cursor, top, cursor + 1.5 * k, top + h], [cursor + 1.5 * k, top, cursor + 3 * k, top + h], [cursor + k, top + 3 * h, cursor + 2 * k, top + 4 * h])
  for (let i = 0; i < 3; i++) keys.push([cursor + i * k, top + 4 * h, cursor + (i + 1) * k, top + 5 * h])
  for (let row = 0; row < 4; row++) for (let c = 0; c < 3; c++) keys.push([pad + c * k, top + row * h, pad + (c + 1) * k, top + (row + 1) * h])
  keys.push([pad, top + 4 * h, pad + 2 * k, top + 5 * h], [pad + 2 * k, top + 4 * h, pad + 3 * k, top + 5 * h])
  keys.push([pad + 3 * k, top, pad + 4 * k, top + h], [pad + 3 * k, top + h, pad + 4 * k, top + 3 * h], [pad + 3 * k, top + 3 * h, pad + 4 * k, top + 5 * h])
  return keys.map(key => amigaQuad(key)).join('')
}

// Hand-drawn art for the catalog modules. A module without an entry shows its presentation/thumbnail.svg.
const ART: Readonly<Record<string, () => ReactElement>> = {
  poly8: () => <g>
    <path className="signal-main" d="M27 96H33C36 96 37 79 41 79S46 113 50 113 55 84 59 84 63 106 67 106 71 96 75 96H81" />
    <path className="signal-ghost" d="M81 96H97Q103 96 103 90V53Q103 47 109 47H111M103 90V139Q103 145 109 145H111M103 61H111M103 75H111M103 89H111M103 103H111M103 117H111M103 131H111" />
    {Array.from({ length: 8 }, (_, voice) => <g key={voice}>
      <circle className="signal-dot" cx="111" cy={47 + voice * 14} r="2.2" opacity={voice % 3 === 0 ? 1 : .65} />
      <path className={voice % 3 === 0 ? 'signal-main' : 'signal-secondary'} d={'M113.2 ' + (47 + voice * 14) + 'H125 ' + polyVoice(voice)} />
    </g>)}
    <text x="25" y="27">SAMPLE</text><text x="211" y="27">UP TO 8 VOICES</text>
    <text x="25" y="177">ONE SAMPLE → CHORDS</text>
  </g>,
  'airwindows-chorus': () => <g>
    <path className="signal-ghost" d="M28 97H292" />
    <path className="signal-ghost" d={sine(0, 36, 2.5)} />
    <path className="signal-secondary" d={sine(.42, 30, 2.5)} />
    <path className="signal-main" d={sine(.85, 30, 2.5)} />
    <path className="signal-secondary" d="M124 48H139M134 44L139 48L134 52M160 143H179M174 139L179 143L174 147" />
    <text x="25" y="27">DRY / DELAY</text><text x="233" y="27">CHORUS</text>
    <text x="25" y="177">SPD / RNG / MIX</text>
  </g>,
  'mute-modes': () => <g>
    <path className="signal-secondary" d="M160 33V155" strokeDasharray="3 5" />
    <text x="147" y="25">MUTE</text>
    {['OT', 'OTFX', 'OTFX-T', 'DT-T'].map((mode, i) => <g key={mode}>
      <text x="25" y={52 + i * 31}>{mode}</text>
      <path className="signal-ghost" d={'M80 ' + (48 + i * 31) + 'H292'} />
      <path className="signal-main" d={muteSignal(i)} />
    </g>)}
    <text x="25" y="177">CUT / TAILS / TRIGS / ENVELOPE</text>
  </g>,
  'recorder-loop-fix': () => <g>
    <path className="signal-ghost" d="M28 85H292" />
    {[28, 116, 204, 292].map(x => <g key={x}>
      <path className="signal-secondary" d={'M' + x + ' 41V129'} strokeDasharray="3 5" />
      <circle className="signal-dot" cx={x} cy="85" r="3" />
    </g>)}
    <path className="signal-main" d={recorderSignal()} />
    <path className="signal-secondary" d="M292 132V145Q292 153 284 153H36Q28 153 28 145V132M23 138L28 132L33 138" />
    <text x="25" y="28">RECORD</text><text x="249" y="28">REPEAT</text>
    <text x="25" y="177">RLEN</text><text x="218" y="177">TEMPO SYNC</text>
  </g>,
  vector: () => <g>
    {[3, 5, 8, 5, 10, 8, 5, 3, 5, 8, 12, 10, 8, 5, 3, 5].map((pitch, i) => <g key={i}>
      <path className="signal-secondary" d={'M' + (32 + i * 17) + ' 144V' + (132 - pitch * 7)} />
      <rect className={i % 3 === 1 ? 'rhythm-off' : 'rhythm-on'} x={27 + i * 17} y={126 - pitch * 7} width="10" height="10" rx="2" />
    </g>)}
    <path className="signal-ghost" d="M25 151H296" />
    <text x="25" y="177">SEED → NOTES → TRIGS</text>
  </g>,
  synth: () => <g>
    <rect className="signal-main" x="24" y="46" width="76" height="44" rx="8" />
    <rect className="signal-main" x="146" y="46" width="90" height="44" rx="8" />
    <path className="signal-secondary" d="M100 68H146M236 68H295M60 90v22H16V32h44v14" />
    <path className="signal-main" d="M32 139c10-28 18 28 28 0s18 28 28 0 18 28 28 0 18 28 28 0 18 28 28 0 18 28 28 0 18 28 28 0 18 28 28 0 18 28 28 0" />
    <text x="41" y="73">MOD</text><text x="162" y="73">CARRIER</text>
    <text x="25" y="177">RATIO / INDEX / FEEDBACK</text>
  </g>,
  'sidechain-compressor': () => <g><g fill="none" stroke="#b5a0ff" strokeLinecap="round" strokeLinejoin="round">
<path d="M27 61H42V40L48 61H85V40L91 61H128V40L134 61H157" strokeWidth="2.3"/>
<path d="M157 61H182V91" strokeWidth="1.7" opacity=".5"/>
<rect x="161" y="96" width="43" height="37" rx="5" strokeWidth="1.7" opacity=".6"/>
<path d="M28 125L34 104L40 144L46 104L52 144L58 104L64 144L70 104L76 144L82 104L88 144L94 104L100 144L106 104L112 144L118 104L124 144L130 104L136 144L142 104L148 144L154 125H161" opacity=".23" strokeWidth="1.7"/>
<path d="M205 125L211 116L217 134L223 110L229 140L235 105L241 145L247 104L253 145L259 116L265 133L271 112L277 138L283 107L289 143L295 125" strokeWidth="2.3"/>
<path d="M211 114C227 112 236 102 250 102M260 114C277 112 284 102 296 102" opacity=".4" strokeWidth="1.3"/>
<path d="M182 78L178 73M182 78L186 73" strokeWidth="1.7"/>
</g>
<g fill="#b5a0ff" fontFamily="monospace" fontSize="9" letterSpacing=".6"><text x="27" y="28" opacity=".7">T1 / KEY</text><text x="168" y="119">COMP</text><text x="25" y="177" opacity=".65">T5 / INPUT</text><text x="207" y="177" opacity=".65">DUCKED OUTPUT</text></g>
</g>,
  miniverb: () => <g>
    {Array.from({ length: 50 }, (_, i) => {
      const height = Math.exp(-i / 18) * (24 + Math.abs(Math.sin(i * 2.7)) * 42)
      return <path key={i} className={i < 7 ? 'signal-main' : 'signal-secondary'} d={'M' + (29 + i * 5.3) + ' ' + (97 - height) + 'v' + (height * 2)} />
    })}
    <path className="signal-ghost" d="M29 32C76 40 110 57 139 70S232 90 293 93" />
    <text x="25" y="177">EARLY REFLECTIONS → TAIL</text>
  </g>,
  tapeecho: () => <g>
    {[95, 225].map((x) => <g key={x}>
      <circle className="reel-outline" cx={x} cy="91" r="49" /><circle className="signal-secondary" cx={x} cy="91" r="35" />
      <circle className="signal-main" cx={x} cy="91" r="8" />
      {[0, 120, 240].map((angle) => <path key={angle} className="reel-spoke" d={'M' + (x - 10) + ' 70q10-11 20 0l-7 10h-6z'} transform={'rotate(' + angle + ' ' + x + ' 91)'} />)}
    </g>)}
    <path className="signal-main" d="M48 102 69 152H251L272 102M137 69h47" />
    <rect className="reel-head" x="143" y="141" width="34" height="21" rx="3" />
    <text x="25" y="180">WOW / FLUTTER / AGE</text>
  </g>,
  euclid: () => <g>
    {Array.from({ length: 16 }, (_, i) => {
      const active = [0, 3, 6, 9, 12].includes(i)
      const angle = i / 16 * Math.PI * 2 - Math.PI / 2
      return <circle key={i} cx={160 + Math.cos(angle) * 59} cy={94 + Math.sin(angle) * 59} r="5.3" className={active ? 'rhythm-on' : 'rhythm-off'} />
    })}
    <circle className="signal-ghost" cx="160" cy="94" r="40" />
    <text className="rhythm-count" x="160" y="99" textAnchor="middle">5 / 16</text>
    <text x="25" y="178">PULSES</text><text x="252" y="178">STEPS</text>
  </g>,
  repitch: () => <g>
    {Array.from({ length: 54 }, (_, i) => {
      const h = 8 + Math.abs(Math.sin(i * 1.7) * Math.sin(i * .26)) * 23
      return <path key={i} className="signal-secondary" d={'M' + (29 + i * 4.9) + ' ' + (67 - h) + 'v' + h * 2} />
    })}
    {Array.from({ length: 40 }, (_, i) => {
      const h = 5 + Math.abs(Math.sin(i * 1.7) * Math.sin(i * .26)) * 16
      return <path key={i} className="signal-main" d={'M' + (29 + i * 6.6) + ' ' + (127 - h) + 'v' + h * 2} />
    })}
    <text x="25" y="178">TEMPO ↓</text><text x="229" y="178">PITCH ↓</text>
  </g>,
  'analog-bassdrum': () => <g>
    <path className="signal-ghost" d="M28 97H292" />
    <path className="signal-main" d={Array.from({length:121},(_,i)=>{
      const x=28+i*2.2, y=97+Math.sin(i*.48)*64*Math.exp(-i/30)
      return (i?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)
    }).join(' ')} />
    <text x="25" y="177">808</text><text x="261" y="177">909</text>
  </g>,
  'usb-audio-out-tracks-main-cue': () => <g>
    {Array.from({length:10},(_,i)=><g key={i}>
      <path className={i<8?'signal-secondary':'signal-main'} d={'M'+(42+i*25)+' 136V'+(54+Math.abs(Math.sin(i*1.3))*42)} />
      <circle className="signal-dot" cx={42+i*25} cy="142" r="3" />
    </g>)}
    <text x="25" y="177">TRACKS 1–8</text><text x="219" y="177">MAIN / CUE</text>
  </g>,
  tapehead: () => <g>
    <path className="signal-ghost" d={sine(0, 49, 2)} />
    <path className="signal-main" d={Array.from({ length: 121 }, (_, i) => {
      const v = Math.sin(i / 120 * Math.PI * 4) * 2
      const c = Math.max(-1, Math.min(1, v))
      return (i ? 'L' : 'M') + (28 + i * 2.2).toFixed(1) + ' ' + (97 + (1.5 * c - .5 * c ** 3) * 36).toFixed(1)
    }).join(' ')} />
    <path className="signal-secondary" d="M28 61H292M28 133H292" strokeDasharray="3 6" />
    <text x="25" y="177">DRIVE → SATURATION → TRIM</text>
  </g>,
  quantizer: () => <g>
    <path className="signal-ghost" d="M28 139 291 43" />
    <path className="signal-main" d="M28 140H65V125H103V111H141V96H179V82H217V67H254V52H291" />
    {[28,65,103,141,179,217,254,291].map((x,i)=><circle key={x} className="signal-dot" cx={x} cy={140-i*14.6} r="3" />)}
    <text x="25" y="177">ROOT</text><text x="222" y="177">24 SCALES</text>
  </g>,
  'cc-map': () => <g>
    {[0,1,2,3,4,5].map(i=><g key={i}>
      <circle className="signal-secondary" cx="48" cy={46+i*21} r="4" />
      <path className="signal-main" d={'M56 '+(46+i*21)+'H126L194 '+(46+i*21)+'H259'} />
      <circle className="reel-outline" cx="274" cy={46+i*21} r="8" />
      <path className="signal-secondary" d={'M274 '+(46+i*21)+'l4-4'} />
    </g>)}
    <text x="25" y="177">CC 68–73</text><text x="209" y="177">FX1 SETUP</text>
  </g>,
  previewvol: () => <g>
    <path className="signal-ghost" d={sine(0, 12, 3)} />
    <path className="signal-main" d={sine(0, 36, 3)} />
    <path className="signal-secondary" d="M29 52H291M29 142H291" strokeDasharray="3 6" />
    <text x="25" y="177">TRACK VOL ↓</text><text x="186" y="177">PREVIEW VOL 0</text>
  </g>,
  // The computer itself; presentation/thumbnail.svg stays as it is because the build approval's source hash covers it.
  amiga: () => <g>
    <path className="signal-dot" opacity=".04" d={amigaPath([[0, 0], [220, 0], [220, 92], [0, 92]])} />
    <path className="signal-dot" opacity=".08" d={amigaPath([[0, 92], [220, 92], [220, 92, 0], [0, 92, 0]])} />
    <path className="signal-dot" opacity=".13" d={amigaPath([[220, 0], [220, 0, 0], [220, 92, 0], [220, 92]])} />
    <path className="signal-secondary" d={amigaPath([[0, 18], [220, 18]], false)} />
    <path className="signal-secondary" style={{ strokeWidth: 1 }} d={Array.from({ length: 14 }, (_, i) => amigaPath([[100 + i * 8, 4], [100 + i * 8, 13]], false)).join('')} />
    <path className="signal-secondary" style={{ strokeWidth: .8 }} d={amigaKeys()} />
    <path className="signal-dot" opacity=".9" d={amigaQuad([196, 80.5, 202, 83], 0)} />
    <path className="signal-dot" opacity=".45" d={amigaQuad([205, 80.5, 211, 83], 0)} />
    <path className="signal-main" style={{ strokeWidth: 1.3 }} d={amigaPath([[220, 26, 15], [220, 62, 15], [220, 62, 11.5], [220, 26, 11.5]])} />
    <path className="signal-dot" opacity=".6" d={amigaPath([[220, 66, 14], [220, 72, 14], [220, 72, 11], [220, 66, 11]])} />
    <path className="signal-main" d={amigaPath([[0, 0], [220, 0], [220, 0, 0], [220, 92, 0], [0, 92, 0], [0, 92]]) + amigaPath([[0, 92], [220, 92], [220, 0]], false) + amigaPath([[220, 92], [220, 92, 0]], false)} />
    <text x="25" y="177">8 BIT</text><text x="235" y="177">SPD 1/2</text>
  </g>,
}

export function ModulePreview({ id, compact = false }: { id: string; compact?: boolean }) {
  return (
    <div className={'module-preview ' + (compact ? 'compact-preview' : '')} data-module={id} aria-hidden="true">
      <div className="preview-label"><span>{DETAILS[id].label}</span><span className="preview-led" /></div>
      <svg viewBox="0 0 320 192" className="signal-art" fill="none">
        <g className="signal-grid">{[52, 97, 142].map((y) => <path key={y} d={'M20 ' + y + 'H300'} />)}{[64, 128, 192, 256].map((x) => <path key={x} d={'M' + x + ' 33V163'} />)}</g>
        {ART[id] ? ART[id]() : <image href={assetUrl('module-media/' + id + '/' + MODULE_DOCUMENTS_BY_ID[id].version + '/presentation/thumbnail.svg')} width="320" height="192" />}
      </svg>
      <div className="preview-controls">{DETAILS[id].controls.slice(0, 3).map((control) => <span key={control}>{control}</span>)}</div>
    </div>
  )
}

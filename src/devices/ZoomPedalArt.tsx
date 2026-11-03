import { useId } from 'react'
import { DeviceArt } from './DeviceArt'
import type { DeviceProfile } from './registry'

type Finish = { light: string; face: string; edge: string; ink: string; screen: string }
const FINISHES: Partial<Record<string, Finish>> = {
  'zoom-ms-70cdr': { light: '#a2cfe3', face: '#71abc6', edge: '#42738d', ink: '#173846', screen: 'SPACE' },
  'zoom-ms-50g': { light: '#e2e2e5', face: '#bfc1c8', edge: '#8b8d95', ink: '#32343a', screen: 'DRIVE' },
  'zoom-ms-60b': { light: '#9d4e60', face: '#782a40', edge: '#4d1f30', ink: '#f5edef', screen: 'BASS' },
}

// Original vector illustrations, not product photos or captures of the pedals' firmware UI.
// Keep the same canvas as DeviceArt so cards, hero images and the machine switcher share one preview.
export function ZoomPedalArt({ device }: { device: DeviceProfile }) {
  const id = 'pedal-' + useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const finish = FINISHES[device.id]
  const floor = device.id === 'zoom-g1on'
  if (!finish && !floor) return <DeviceArt art={device.art} />
  const colors = finish ?? { light: '#53565b', face: '#34363a', edge: '#1f2226', ink: '#71b1e5', screen: 'PATCH' }
  return <svg className="device-art zoom-pedal-art" viewBox="0 0 240 160" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={id + '-body'} x1="0" y1="0" x2="1" y2=".7">
        <stop stopColor={colors.light} /><stop offset=".32" stopColor={colors.face} /><stop offset=".88" stopColor={colors.face} /><stop offset="1" stopColor={colors.edge} />
      </linearGradient>
      <linearGradient id={id + '-metal'} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f1f1ec" /><stop offset=".3" stopColor="#bfc4c7" /><stop offset=".55" stopColor="#707780" /><stop offset=".8" stopColor="#c8cdd0" /><stop offset="1" stopColor="#858c93" />
      </linearGradient>
      <linearGradient id={id + '-rubber'} x2="0" y2="1">
        <stop stopColor="#33373b" /><stop offset="1" stopColor="#101317" />
      </linearGradient>
      <linearGradient id={id + '-lcd'} x2="0" y2="1">
        <stop stopColor={floor ? '#f3bc83' : '#e7ecee'} /><stop offset="1" stopColor={floor ? '#d8864f' : '#b9c4cb'} />
      </linearGradient>
    </defs>
    <ellipse cx="120" cy="149" rx={floor ? 65 : 44} ry="6" fill="#000" opacity=".24" />
    {floor ? <FloorPedal id={id} /> : <MultiStomp id={id} name={device.name} finish={colors} />}
  </svg>
}

function Knob({ x, y, blue = false }: { x: number; y: number; blue?: boolean }) {
  return <g>
    <circle cx={x} cy={y + 1} r="7.5" fill="#080a0d" />
    <circle cx={x} cy={y} r="6.3" fill={blue ? '#377db7' : '#25282d'} stroke={blue ? '#1c4d78' : '#101316'} strokeWidth=".7" />
    {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M${x} ${y - 6}v1.5`} transform={`rotate(${i * 30} ${x} ${y})`} stroke={blue ? '#68a9da' : '#52555a'} strokeWidth=".6" />)}
    <circle cx={x} cy={y} r="4.3" fill={blue ? '#468fcb' : '#34363b'} />
  </g>
}

function Screen({ id, x, y, width, title, warm = false }: { id: string; x: number; y: number; width: number; title: string; warm?: boolean }) {
  return <g>
    <rect x={x - 3} y={y - 3} width={width + 6} height="37" rx="2.5" fill={warm ? '#d68d65' : '#7d858c'} stroke={warm ? '#efb58d' : '#edf1f3'} strokeOpacity=".6" strokeWidth=".7" />
    <rect x={x} y={y} width={width} height="31" rx="1" fill={'url(#' + id + '-lcd)'} />
    <g fill="#39434a" fontFamily="monospace" fontSize="4.4" fontWeight="700">
      <text x={x + 3} y={y + 6}>{title}</text><text x={x + width - 10} y={y + 6}>01</text>
    </g>
    <path d={`M${x + 2} ${y + 9}h${width - 4}`} stroke="#65717b" strokeWidth=".6" />
    {[0, 1, 2].map(i => <g key={i} transform={`translate(${x + 9 + i * (width - 18) / 2} ${y + 20})`} stroke="#4e5a64" strokeWidth="1">
      <path d="M-3.7 3a5 5 0 1 1 7.4 0M0 0l2-3" />
      <path d="M-4 7h8" strokeWidth="1.3" />
    </g>)}
    <path d={`M${x + 1} ${y + 1}h${width - 2}`} stroke="#fff" strokeOpacity=".45" />
  </g>
}

function MultiStomp({ id, name, finish }: { id: string; name: string; finish: Finish }) {
  const shape = 'M85 6h70q6 0 6 6v131q0 6-6 6H85q-6 0-6-6V12q0-6 6-6Z'
  return <g>
    {/* Side sockets sit behind the folded metal enclosure. */}
    {[74, 159].map(x => <g key={x}>
      <rect x={x} y="45" width="7" height="15" rx="2" fill={'url(#' + id + '-metal)'} stroke="#3f454b" strokeWidth=".7" />
      <path d={`M${x + 2} 47v11m3-11v11`} stroke="#363b42" strokeWidth=".8" />
    </g>)}
    <path d={shape} transform="translate(0 3)" fill={finish.edge} stroke="#11171c" strokeWidth="1.2" />
    <path d={shape} fill={'url(#' + id + '-body)'} stroke={finish.light} strokeOpacity=".75" strokeWidth=".8" />
    <path d="M82 17v124q0 4 4 4h68" stroke="#fff" strokeOpacity=".2" strokeWidth=".8" />
    <path d="M157 18v121" stroke={finish.edge} strokeWidth="2" opacity=".55" />
    <g fill={finish.ink} textAnchor="middle" fontFamily="system-ui, sans-serif">
      <text x="120" y="16" fontSize="5.1" fontWeight="750" letterSpacing=".55">{name}</text>
      <text x="120" y="83" fontSize="3.2" fontWeight="600" letterSpacing=".65">MULTI STOMP</text>
    </g>
    <Screen id={id} x={95} y={25} width={50} title={finish.screen} />
    <rect x="85" y="62" width="70" height="16" rx="3" fill={finish.edge} fillOpacity=".25" stroke="#fff" strokeOpacity=".2" strokeWidth=".6" />
    {[96, 120, 144].map(x => <Knob key={x} x={x} y={70} />)}
    <circle cx="95" cy="91" r="2.2" fill="#36201d" stroke="#f4ddd0" strokeOpacity=".45" strokeWidth=".5" />
    <circle cx="95" cy="90.6" r="1.2" fill="#ff9277" />
    <circle cx="120" cy="115" r="24" fill="#20262b" stroke={finish.light} strokeOpacity=".65" strokeWidth=".8" />
    <circle cx="120" cy="115" r="20.5" fill={'url(#' + id + '-rubber)'} stroke="#48515a" strokeWidth=".8" />
    <g fill="#929ba2">
      <path d="m120 96-3 4h6Zm0 38-3-4h6Zm-19-19 4-3v6Zm38 0-4-3v6Z" />
    </g>
    <circle cx="120" cy="116" r="11.3" fill="#080c10" />
    <circle cx="120" cy="114.5" r="10.5" fill={'url(#' + id + '-metal)'} stroke="#d4d9db" strokeWidth=".6" />
    <circle cx="120" cy="114" r="7.5" fill="#aeb6bb" stroke="#f5f5ef" strokeOpacity=".6" strokeWidth=".6" />
    <path d="M114 111a7 7 0 0 1 10-2" stroke="#edf0eb" strokeOpacity=".6" strokeLinecap="round" />
    {[86, 154].map(x => <g key={x}>
      <circle cx={x} cy="141" r="1.6" fill={finish.edge} stroke={finish.light} strokeWidth=".5" />
      <path d={`M${x - .7} 141h1.4`} stroke={finish.light} strokeWidth=".5" />
    </g>)}
  </g>
}

function FloorPedal({ id }: { id: string }) {
  return <g>
    <rect x="47" y="8" width="146" height="144" rx="10" fill="#15191d" stroke="#090c0f" strokeWidth="1.4" />
    <rect x="47" y="5" width="146" height="141" rx="5" fill={'url(#' + id + '-body)'} stroke="#707278" strokeWidth=".8" />
    <path d="M53 14v122q0 5 5 5h124" stroke="#fff" strokeOpacity=".18" />
    <path d="M120 8v75" stroke="#15171a" strokeWidth="4" />
    <path d="M122 8v73" stroke="#686a70" strokeOpacity=".45" />
    <text x="57" y="17" fill="#5b9ed4" fontFamily="system-ui, sans-serif" fontSize="6.2" fontWeight="750" letterSpacing=".4">G1on</text>
    <Screen id={id} x={65} y={28} width={43} title="PATCH" warm />
    <rect x="142" y="25" width="31" height="31" rx="2" fill="#11171c" stroke="#5e646b" />
    <path d="m145 28 12.5 11L170 28Zm25 3-11 9.5L170 50Zm-3 22-9.5-11L148 53Zm-22-3 11-9.5L145 31Z" fill="#408dce" stroke="#6aa7d8" strokeWidth=".5" />
    <Knob x={87} y={72} blue />
    {[65, 109, 141, 173].map(x => <circle key={x} cx={x} cy="72" r="4.4" fill="#418bca" stroke="#11171d" strokeWidth="1" />)}
    <path d="M49 84h142" stroke="#101316" strokeWidth="3" />
    {[53, 123].map((x, side) => <g key={x}>
      <rect x={x} y="88" width="64" height="53" rx="5" fill={'url(#' + id + '-rubber)'} stroke="#11171c" />
      {Array.from({ length: 7 }, (_, row) => {
        const width = side ? 20 + row * 5 : 50 - row * 5
        return <rect key={row} x={x + (64 - width) / 2} y={95 + row * 5.7} width={width} height="2.3" rx="1.15" fill="#41484e" stroke="#657077" strokeOpacity=".3" strokeWidth=".4" />
      })}
    </g>)}
    <path d="M120 86v56" stroke="#15171a" strokeWidth="3" />
  </g>
}

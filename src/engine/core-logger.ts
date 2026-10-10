// Always-installed infrastructure. Only authored object bytes are bundled;
// guarded stock instructions are supplied by the user's verified local OS.
import chooserMetadata from './assets/chooser-metadata.json' with { type: 'json' }
import pkg from './assets/core-logger.json' with { type: 'json' }
import { parseColdFireObject } from './coldfire-elf.ts'
import type { CfRuntimeLink } from './coldfire-link.ts'
import { compiledModuleSource } from './module-build.ts'
import { resolveSelection } from '../catalog/modules.ts'
import type { OsWrite } from './os-patches.ts'
export const LOGGER_RESERVE_BYTES = 16 * 6144
export const LOGGER_RETAINED_BYTES = 8192
const BASE = 0x40a955e0, OS_BASE = 0x40000400
export async function loggerHash(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer)), byte => byte.toString(16).padStart(2,'0')).join('')
}
const encode = (s: string) => new TextEncoder().encode(s)
export function loggerExternals(reserveBytes: number, base = BASE) {
  if (!Number.isInteger(reserveBytes) || reserveBytes < LOGGER_RESERVE_BYTES || reserveBytes % 6144) throw new Error('Invalid core logger reservation.')
  if (!Number.isInteger(base) || base < BASE || (base - BASE) % 6144 || base + reserveBytes > 0x46025de0) throw new Error('Invalid core logger base.')
  const retained = base + reserveBytes - LOGGER_RETAINED_BYTES
  return new Map([['octamod_log_retained', retained], ['octamod_log_io', Math.ceil((retained + 6144) / 512) * 512 + 0x08000000]])
}
export async function readCoreLogger() {
  if (pkg.schema !== 1 || pkg.kind !== 'octamod-core-logger' || pkg.stockRead !== false || pkg.cpu !== '54455' || pkg.bytes < 52 || pkg.bytes > 256 * 1024 || pkg.code.length !== pkg.bytes * 2 || !/^[0-9a-f]+$/.test(pkg.code)) throw new Error('Invalid core logger package.')
  const bytes = Uint8Array.from({length:pkg.bytes}, (_,i) => parseInt(pkg.code.slice(i*2,i*2+2),16))
  if (await loggerHash(bytes) !== pkg.sha256) throw new Error('Core logger package checksum mismatch.')
  return { label: 'octamod-core-logger', object: parseColdFireObject(bytes) }
}
export async function installCoreLogger(runtime: CfRuntimeLink, original: Uint8Array, ids: readonly string[], chooser: {fx1: readonly string[]; fx2: readonly string[]; hidden: readonly string[]}) {
  const source = await loggerHash(encode(JSON.stringify({core:pkg.sourceSha256,modules:compiledModuleSource().sourceTreeSha256})))
  const modules = resolveSelection(ids).map(({id,version}) => ({id,version}))
  const own = new Set(resolveSelection(ids).map(module => module.key))
  const configuration = {fx1:['NONE',...(chooser.fx1.length?chooser.fx1:chooserMetadata.stockFx1)],fx2:['NONE',...chooser.fx2],hidden:[...chooser.hidden],logger:pkg.version,modules,os:'1.40C',source,stockfx2:chooser.fx2.some(key=>!own.has(key))}
  const hash = await loggerHash(encode(JSON.stringify(configuration)))
  const values = {build:hash.slice(0,16),os:configuration.os,modules:modules.map(m=>m.id+'@'+m.version).join(';'),configuration:hash,source,fx1:configuration.fx1.join(';'),fx2:configuration.fx2.join(';'),hidden:configuration.hidden.join(';')}
  const text = runtime.sections.find(section => section.name === '.text')
  if (!text) throw new Error('Core logger runtime text is missing.')
  const base = text.address
  function offset(name: string, size: number) {
    const address = runtime.symbols.get(name)
    if (address === undefined || address < base || address + size > base + runtime.bytes.length) throw new Error('Core logger symbol is outside the runtime: '+name)
    return address - base
  }
  for (const [name,size] of Object.entries(pkg.fields)) {
    const value = encode(values[name as keyof typeof values])
    if (value.length >= size || value.some(b => b < 32 || b > 126)) throw new Error('Core logger configuration exceeds its bounded field: '+name)
    const at = offset('olog_'+name,size)
    runtime.bytes.fill(0,at,at+size);runtime.bytes.set(value,at)
  }
  // Eight ColdFire pointers precede the uint32 stock-FX2 flag.
  new DataView(runtime.bytes.buffer,runtime.bytes.byteOffset,runtime.bytes.byteLength).setUint32(offset('octamod_log_identity',36)+32,Number(configuration.stockfx2))
  const writes: OsWrite[] = []
  for (const [key,guard] of Object.entries(pkg.guards)) {
    const at = guard.address - OS_BASE
    if (at < 0 || at + guard.length > original.length || await loggerHash(original.slice(at,at+guard.length)) !== guard.sha256) throw new Error('Core logger stock guard mismatch: '+key)
    if (!['idle','job','transport','open','read','write','close'].includes(key)) continue
    const n = 'patchLength' in guard ? guard.patchLength : guard.length
    runtime.bytes.set(original.slice(at,at+n),offset('olog_replay_'+key,n))
    const target = runtime.symbols.get('olog_'+key+'_hook')
    const text = runtime.sections.find(section=>section.name==='.text')
    if (!target || !text || target < text.address || target >= text.address + text.size || target % 2) throw new Error('Invalid core logger hook: '+key)
    const bytes = new Uint8Array(n),view = new DataView(bytes.buffer)
    view.setUint16(0,0x4ef9);view.setUint32(2,target)
    for (let i=6;i<n;i+=2)view.setUint16(i,0x4e71)
    writes.push({address:guard.address,guardLength:guard.length,guardSha256:guard.sha256,bytes,note:'core logger '+key})
  }
  return {writes,configuration,configurationHash:hash}
}

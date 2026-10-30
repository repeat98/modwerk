import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import pkg from './assets/core-logger.json'
import {readCoreLogger,loggerExternals,LOGGER_RESERVE_BYTES} from './core-logger'
import {createStaticColdFireRuntime} from './coldfire-runtime'
import {runtimeStageLayout} from './bootstrap'
import {DOWNLOADS_ENABLED} from './protocol'
import {composeOs} from './compose-os'
const sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex')
describe('mandatory core logger',()=>{
 it('pins the original source inventory and contains only zero stock replay placeholders',async()=>{
  const dir=new URL('../../sdk/runtime/logging/',import.meta.url)
  const sources=Object.fromEntries(readdirSync(dir).filter(p=>/\.(c|h|py|json)$/.test(p)).sort().map(p=>[p,sha(readFileSync(new URL(p,dir)))]))
  expect(pkg.sources).toEqual(sources)
  expect(pkg.sourceSha256).toBe(sha(JSON.stringify(sources)))
  const {object}=await readCoreLogger()
  for(const [key,row] of Object.entries(pkg.guards)){
   const symbol=object.symbols.find(s=>s.name==='olog_replay_'+key)
   if(!symbol)continue
   const n='replay' in row?row.replay:'patchLength' in row?row.patchLength:row.length
   expect(Array.from(object.sections[symbol.section].data.slice(symbol.value,symbol.value+n))).toEqual(Array(n).fill(0))
  }
 })
 it('ships with empty, ROM-only and ColdFire selections without adding a catalog module',async()=>{
  for(const ids of [[],['repitch'],['miniverb'],['tapeecho'],['euclid']]){
   const runtime=await createStaticColdFireRuntime(ids)
   expect(runtime.units.filter(s=>s==='octamod-core-logger')).toHaveLength(1)
   expect(runtime.symbols.has('olog_idle_hook')).toBe(true)
   expect(runtime.reserveBytes).toBe(ids.some(id=>['tapeecho','euclid'].includes(id))?1707*6144+LOGGER_RESERVE_BYTES:LOGGER_RESERVE_BYTES)
   const ceiling=loggerExternals(runtime.reserveBytes).get('octamod_log_retained')!
   expect(runtimeStageLayout(runtime.bytes.length,8192,runtime.reserveBytes-8192).stageEnd).toBeLessThan(ceiling)
  }
 })
 it('allows downloads under the explicit owner-approved logger exception',()=>{
  expect(DOWNLOADS_ENABLED).toBe(true)
 })
 it('routes standalone MIDI Scenes to its guarded reconstruction and still refuses changed firmware',async()=>{
  await expect(composeOs(new Uint8Array(4),['midi-scenes'])).rejects.toThrow('unmodified original OS 1.40C')
 })
})

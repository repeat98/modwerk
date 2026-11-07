import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LinkDiagnostic, OctatrackLink } from '../engine/elekloader/octatrack-link'
import { collectOctatrackDiagnostics, changeDiagnosticSharing, diagnosticPreference } from './octatrack-diagnostics'
import { api, apiFetch, post } from './api'
import { countOctatrackAction } from './usage'
import { OCTATRACK_DIAGNOSTICS_VERSION as version } from './octatrack-diagnostics-contract'
vi.mock('./api',()=>{
  const api=vi.fn(),apiFetch=vi.fn(),post=vi.fn()
  return {api,apiFetch,post,scopedApi:()=>({current:()=>true,request:(path:string,options?:RequestInit)=>options?.method==='PUT'?post(path,JSON.parse(String(options.body)),'PUT'):api(path,options),fetch:apiFetch})}
})
vi.mock('./usage',()=>({browserRequestsPrivacy:()=>false,countOctatrackAction:vi.fn()}))
let cleanup:undefined|(()=>void), enabled=false
const consent=()=>({accountId:'member',enabled,version,changedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()})
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();enabled=false;vi.mocked(api).mockImplementation(async()=>consent() as never);vi.mocked(post).mockImplementation(async(_path,body)=>{enabled=(body as {enabled:boolean}).enabled;return consent() as never});vi.mocked(apiFetch).mockResolvedValue(Response.json({ok:true,stored:true}))})
afterEach(()=>{cleanup?.();cleanup=undefined;vi.useRealTimers()})
async function fixture() {
  let listener:((event:LinkDiagnostic)=>void)|undefined
  const health=vi.fn(async()=>({state:2,failed:0,modules:2,dsp:2,intact:2,ran:2,cpu:300,tracks1to4:200,tracks5to8:200,frameGap:47900,saved:7,savedCount:2,live:2,culprit:0,refusal:0}))
  const link={subscribeDiagnostics:(fn:(event:LinkDiagnostic)=>void)=>{listener=fn;return()=>{listener=undefined}},health,getState:()=>({status:'ready',identity:{base:'a'.repeat(64),canSubmit:true},active:'b'.repeat(64)})} as unknown as OctatrackLink
  cleanup=collectOctatrackDiagnostics('member',link,()=>({moduleIds:['everb'],removedStockFx:[]}))
  await vi.advanceTimersByTimeAsync(0)
  return {health,emit:(event:LinkDiagnostic)=>listener?.(event)}
}
describe('beta diagnostic collection',()=>{
  it('makes no diagnostic reads or uploads before opt-in, but counts fixed sync actions',async()=>{
    const {health,emit}=await fixture()
    emit({event:'sync_started',phase:'sending',base:'a'.repeat(64)})
    emit({event:'sync_failed',phase:'sending',error:'device',refusal:3})
    await vi.advanceTimersByTimeAsync(30000)
    expect(health).not.toHaveBeenCalled();expect(apiFetch).not.toHaveBeenCalled()
    expect(countOctatrackAction).toHaveBeenNthCalledWith(1,'usb_sync_started');expect(countOctatrackAction).toHaveBeenNthCalledWith(2,'usb_sync_failed')
  })
  it('collects numeric status after consent and stops on remote revocation',async()=>{
    const {health}=await fixture();await changeDiagnosticSharing(true)
    await vi.advanceTimersByTimeAsync(30000)
    expect(health).toHaveBeenCalledTimes(1)
    const request=vi.mocked(apiFetch).mock.calls[0][1]!
    const body=JSON.parse(String(request.body))
    expect(body).toMatchObject({version,data:{event:'health',base:'a'.repeat(64),reading:{cpu:300},modules:[{id:'everb',catalogVersion:expect.any(String)}]}})
    expect(body.data).not.toHaveProperty('project');expect(body.data).not.toHaveProperty('culpritName')
    enabled=false;await vi.advanceTimersByTimeAsync(30000)
    expect(health).toHaveBeenCalledTimes(1);expect(diagnosticPreference().enabled).toBe(false)
  })
  it('queues a failure behind an in-flight event and discards queued data immediately on withdrawal',async()=>{
    const {emit}=await fixture();await changeDiagnosticSharing(true)
    let finish:(value:Response)=>void=()=>{}
    vi.mocked(apiFetch).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    emit({event:'sync_started',phase:'sending'});emit({event:'sync_failed',phase:'sending',error:'device'})
    expect(apiFetch).toHaveBeenCalledTimes(1)
    const signal=vi.mocked(apiFetch).mock.calls[0][1]!.signal!
    await changeDiagnosticSharing(false)
    expect(signal.aborted).toBe(true)
    finish(Response.json({ok:true,stored:true}));await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).toHaveBeenCalledTimes(1);expect(diagnosticPreference().enabled).toBe(false)
    emit({event:'sync_failed',phase:'sending',error:'device'});expect(apiFetch).toHaveBeenCalledTimes(1)
  })
  it('does not let an older consent read overwrite a newly saved choice',async()=>{
    await fixture()
    let finish:(value:ReturnType<typeof consent>)=>void=()=>{}
    const previous=consent()
    vi.mocked(api).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish}))
    await vi.advanceTimersByTimeAsync(30000)
    await changeDiagnosticSharing(true)
    finish(previous);await vi.advanceTimersByTimeAsync(0)
    expect(diagnosticPreference().enabled).toBe(true)
  })
  it('skips background reads while a consent refresh is still pending',async()=>{
    const {health}=await fixture();await changeDiagnosticSharing(true)
    let finish:(value:ReturnType<typeof consent>)=>void=()=>{}
    vi.mocked(api).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish}))
    await vi.advanceTimersByTimeAsync(60000)
    expect(health).not.toHaveBeenCalled()
    enabled=false;finish(consent());await vi.advanceTimersByTimeAsync(0)
    expect(health).not.toHaveBeenCalled()
  })
  it('ignores an old enable reply across remount and serializes withdrawal behind it',async()=>{
    await fixture()
    let finish:(value:ReturnType<typeof consent>)=>void=()=>{}
    vi.mocked(post).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve as typeof finish}))
    const enabling=changeDiagnosticSharing(true)
    cleanup?.();const {health}=await fixture()
    expect(diagnosticPreference().busy).toBe(true)
    finish({...consent(),enabled:true});await enabling
    expect(diagnosticPreference().enabled).toBe(false)
    await vi.advanceTimersByTimeAsync(30000)
    await changeDiagnosticSharing(false)
    await vi.advanceTimersByTimeAsync(30000)
    expect(health).not.toHaveBeenCalled();expect(diagnosticPreference().enabled).toBe(false)
  })
  it('keeps a failed local withdrawal stopped across same-account remounts',async()=>{
    await fixture();await changeDiagnosticSharing(true)
    vi.mocked(post).mockRejectedValueOnce(new Error('Offline'))
    await changeDiagnosticSharing(false);expect(diagnosticPreference().error).toContain('Sharing stopped on this page')
    cleanup?.();const {health,emit}=await fixture()
    await vi.advanceTimersByTimeAsync(30000)
    emit({event:'sync_started',phase:'sending'})
    expect(health).not.toHaveBeenCalled();expect(apiFetch).not.toHaveBeenCalled();expect(diagnosticPreference().enabled).toBe(false)
  })
  it('reads the choice once without a connected unit, and again when the tab comes back into view',async()=>{
    const page=Object.assign(new EventTarget(),{visibilityState:'hidden'});vi.stubGlobal('document',page)
    const link={subscribeDiagnostics:()=>()=>{},getState:()=>({status:'idle'})} as unknown as OctatrackLink
    cleanup=collectOctatrackDiagnostics('member',link,()=>undefined)
    await vi.advanceTimersByTimeAsync(10*30000)
    expect(api).toHaveBeenCalledTimes(1)
    page.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0)
    expect(api).toHaveBeenCalledTimes(1)
    page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0)
    expect(api).toHaveBeenCalledTimes(2)
    cleanup();cleanup=undefined;page.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0)
    expect(api).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })
  it('requires the consent account to match the rendered member before collecting',async()=>{
    vi.mocked(api).mockResolvedValue({...consent(),accountId:'another',enabled:true} as never)
    const {health,emit}=await fixture();await vi.advanceTimersByTimeAsync(30000)
    emit({event:'sync_started',phase:'sending'})
    expect(health).not.toHaveBeenCalled();expect(apiFetch).not.toHaveBeenCalled();expect(diagnosticPreference().ready).toBe(false)
  })
})

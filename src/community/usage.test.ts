import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { USAGE_CONSENT_VERSION } from '../legal/policy'
let usage: typeof import('./usage')
let values: Map<string,string>
let request: ReturnType<typeof vi.fn>
beforeEach(async()=>{
 vi.resetModules();vi.stubEnv('VITE_COMMUNITY_API_URL','');vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-01T12:00:00Z'))
 values=new Map();request=vi.fn().mockResolvedValue(new Response('{}'))
 vi.stubGlobal('window',{});vi.stubGlobal('navigator',{doNotTrack:null});vi.stubGlobal('fetch',request)
 vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)})
 usage=await import('./usage')
})
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs()})
describe('optional usage reporting',()=>{
 it('does not create identifiers or send counts before explicit consent, including legacy preferences',()=>{
  expect(usage.usageAllowed()).toBe(false)
  for(const preference of [undefined,'off','on']){
   if(preference)values.set('octamod.usage.opt-out',preference)
   request.mockClear();usage.trackPageView('library'+preference);usage.trackUsage('build_succeeded');usage.trackConfigurationStarted('33333333-3333-4333-8333-333333333333');usage.trackFirmwareDownload(['miniverb'],'octatrack')
   // Only identifier-free totals leave the browser before consent.
   for(const [url,options] of request.mock.calls){expect(url).toBe('/api/usage/count');expect(options.credentials).toBe('omit');expect(options.headers).toEqual({'Content-Type':'application/json'});expect(Object.keys(JSON.parse(options.body)).every(key=>key==='event'||key==='moduleId'||key==='device'||key==='page')).toBe(true)}
   expect(values.has('octamod.usage.daily-visitor')).toBe(false);expect(values.has('octamod.usage.started-configurations')).toBe(false)
  }
  usage.setAnonymousCountsAllowed(false);request.mockClear();usage.trackPageView('forum');usage.trackUsage('build_succeeded');usage.trackFirmwareDownload(['miniverb'],'octatrack')
  expect(request).not.toHaveBeenCalled()
 })
 it('stops counts immediately when storage rejects withdrawal',()=>{
  values.set('modwerk.usage.anonymous-off','1');usage.setUsageAllowed(true);usage.trackUsage('page_view');expect(request).toHaveBeenCalledTimes(1)
  vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)??null,removeItem:()=>{throw new Error('Read-only storage')}})
  expect(usage.setUsageAllowed(false)).toBe(false);expect(usage.usageAllowed()).toBe(false);usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(request).toHaveBeenCalledTimes(1)
 })
 it('records consent version/time, expires it and withdraws without counting again',()=>{
  values.set('modwerk.usage.anonymous-off','1');usage.setUsageAllowed(true)
  expect(JSON.parse(values.get('octamod.usage.consent')!)).toEqual({version:USAGE_CONSENT_VERSION,acceptedAt:'2026-10-01T12:00:00.000Z'})
  usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(request).toHaveBeenCalledTimes(2)
  vi.setSystemTime(new Date('2027-04-01T12:00:00Z'));expect(usage.usageAllowed()).toBe(false)
  values.set('octamod.usage.consent',JSON.stringify({version:'old-policy',acceptedAt:new Date().toISOString()}));expect(usage.usageAllowed()).toBe(false)
  usage.setUsageAllowed(false);usage.trackFirmwareDownload(['miniverb'],'octatrack')
  expect(request).toHaveBeenCalledTimes(2)
  for(const key of ['octamod.usage.consent','octamod.usage.daily-visitor','octamod.usage.started-configurations'])expect(values.has(key)).toBe(false)
 })
 it.each(['','https://community.example/api'])('sends only anonymous fields without credentials for API base %s',(apiBase)=>{
  vi.stubEnv('VITE_COMMUNITY_API_URL',apiBase)
  values.set('octamod.community.session:'+(apiBase||'/api'),'a'.repeat(64));values.set('octamod.community.admin:'+(apiBase||'/api'),'b'.repeat(64))
  usage.setUsageAllowed(true)
  const configuration='33333333-3333-4333-8333-333333333333'
  usage.trackConfigurationStarted(configuration);usage.trackConfigurationStarted(configuration)
  expect(request).toHaveBeenCalledTimes(1)
  const [url,options]=request.mock.calls[0];expect(url).toBe((apiBase||'/api')+'/usage/events');expect(options.credentials).toBe('omit');expect(options.referrerPolicy).toBe('no-referrer')
  expect(Object.keys(JSON.parse(options.body)).sort()).toEqual(['event','eventId','visitor'])
  expect(options.body).not.toContain(configuration);expect(options.headers).toEqual({'Content-Type':'application/json','X-Octamod-Usage-Consent':USAGE_CONSENT_VERSION})
 })
 it('deduplicates page effects, excludes admin views, sends only known page keys and rotates the visitor daily',()=>{
  usage.setUsageAllowed(true)
  usage.trackPageView('library');usage.trackPageView('library');usage.trackPageView('admin');usage.trackPageView('library')
  expect(request).toHaveBeenCalledTimes(2)
  const first=JSON.parse(request.mock.calls[0][1].body);expect(first.visitor).toBe(JSON.parse(request.mock.calls[1][1].body).visitor)
  expect(first.page).toBe('library:octatrack')
  vi.setSystemTime(new Date('2026-10-02T00:00:01Z'));usage.trackUsage('page_view')
  expect(JSON.parse(request.mock.calls[2][1].body).visitor).not.toBe(first.visitor)
 })
 it('honors Do Not Track, Global Privacy Control and the saved opt-out before creating identifiers',()=>{
  vi.stubGlobal('navigator',{doNotTrack:'1'});usage.trackUsage('page_view');usage.trackPageView('library');expect(values.size).toBe(0);expect(request).not.toHaveBeenCalled()
  vi.stubGlobal('navigator',{globalPrivacyControl:true});usage.trackUsage('page_view');usage.trackPageView('forum');expect(values.size).toBe(0);expect(request).not.toHaveBeenCalled()
  vi.stubGlobal('navigator',{});values.set('modwerk.usage.anonymous-off','1');expect(usage.setUsageAllowed(false)).toBe(true);usage.trackUsage('page_view');expect(request).not.toHaveBeenCalled()
  expect(usage.setUsageAllowed(true)).toBe(true);usage.trackUsage('page_view');expect(request).toHaveBeenCalledTimes(1)
  usage.setUsageAllowed(false);expect(values.has('octamod.usage.daily-visitor')).toBe(false)
 })
 it('reports a completed firmware request and each unique available module with independent event IDs',()=>{
  usage.setUsageAllowed(true)
  usage.trackFirmwareDownload(['miniverb','tapeecho','miniverb','spectrum','unknown'],'octatrack')
  expect(request).toHaveBeenCalledTimes(3)
  const bodies=request.mock.calls.map(([url,options])=>({url,options,body:JSON.parse(options.body)}))
  expect(bodies[0].body).toMatchObject({event:'firmware_download_requested',device:'octatrack'})
  expect(Object.keys(bodies[0].body).sort()).toEqual(['device','event','eventId','visitor'])
  expect(bodies.slice(1).map(item=>item.body.moduleId)).toEqual(['miniverb','tapeecho'])
  expect(new Set(bodies.map(item=>item.body.eventId)).size).toBe(3)
  for(const item of bodies.slice(1)) {
   expect(item.url).toBe('/api/usage/module-downloads');expect(Object.keys(item.body).sort()).toEqual(['eventId','moduleId','visitor'])
   expect(item.options.credentials).toBe('omit');expect(item.options.referrerPolicy).toBe('no-referrer');expect(item.options.headers).toEqual({'Content-Type':'application/json','X-Octamod-Usage-Consent':USAGE_CONSENT_VERSION})
  }
  usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(request).toHaveBeenCalledTimes(5)
 })
 it('suppresses public module reporting for browser privacy and opt-outs',()=>{
  vi.stubGlobal('navigator',{doNotTrack:'1'});usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(values.size).toBe(0)
  vi.stubGlobal('navigator',{globalPrivacyControl:true});usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(values.size).toBe(0)
  vi.stubGlobal('navigator',{});values.set('modwerk.usage.anonymous-off','1');usage.setUsageAllowed(false);usage.trackFirmwareDownload(['miniverb'],'octatrack');expect(request).not.toHaveBeenCalled()
 })
 it.each([false,true])('tracks each machine-specific module independently with opt-in set to %s',optedIn=>{
  if(optedIn)usage.setUsageAllowed(true)
  usage.trackFirmwareDownload(['digitakt-digihealth','digitakt-digihealth','digitone-digihealth','digitakt-digislicer','digihealth','digitone-digislicer','unknown'],'digitakt')
  const bodies=request.mock.calls.map(([,options])=>JSON.parse(options.body))
  expect(bodies[0].event).toBe('firmware_download_requested')
  expect(bodies.slice(1).map(body=>body.moduleId)).toEqual(['digitakt-digihealth','digitone-digihealth','digitakt-digislicer'])
  expect(request).toHaveBeenCalledTimes(4)
  usage.trackFirmwareDownload(['digitakt-digihealth'],'digitakt')
  expect(request).toHaveBeenCalledTimes(6)
  if(!optedIn)expect(values.size).toBe(0)
 })
 it('counts identifier-free totals once per configuration and per available module without storing anything',()=>{
  const configuration='33333333-3333-4333-8333-333333333333'
  usage.trackConfigurationStarted(configuration);usage.trackConfigurationStarted(configuration);usage.trackFirmwareDownload(['miniverb','miniverb','unknown'],'octatrack')
  expect(request.mock.calls.map(([url,options])=>[url,JSON.parse(options.body)])).toEqual([['/api/usage/count',{event:'configuration_started'}],['/api/usage/count',{event:'firmware_download_requested',device:'octatrack'}],['/api/usage/count',{event:'module_download',moduleId:'miniverb'}]])
  expect(values.size).toBe(0)
  usage.setAnonymousCountsAllowed(false);expect(values.get('modwerk.usage.anonymous-off')).toBe('1');usage.setAnonymousCountsAllowed(true);expect(values.size).toBe(0)
 })
 it('counts public announcement cards for every viewer with only the action and announcement ID, unless the browser objects',()=>{
  const id='announcement-'+'a'.repeat(32)
  usage.trackAnnouncement('announcement_shown',id);usage.trackAnnouncement('announcement_dismissed','announcement-not-an-id')
  usage.setUsageAllowed(true);usage.trackAnnouncement('announcement_opened',id)
  expect(request.mock.calls.map(([url,options])=>[url,options.credentials,JSON.parse(options.body)])).toEqual([['/api/usage/count','omit',{event:'announcement_shown',announcementId:id}],['/api/usage/count','omit',{event:'announcement_opened',announcementId:id}]])
  usage.setUsageAllowed(false);usage.setAnonymousCountsAllowed(false);request.mockClear();usage.trackAnnouncement('announcement_dismissed',id)
  usage.setAnonymousCountsAllowed(true);vi.stubGlobal('navigator',{doNotTrack:'1'});usage.trackAnnouncement('announcement_dismissed',id)
  expect(request).not.toHaveBeenCalled()
 })
 it('never blocks local work when storage or the service is unavailable',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>{throw new Error('Unavailable')}});expect(()=>usage.trackUsage('page_view')).not.toThrow()
  expect(request.mock.calls.map(([url])=>url)).toEqual(['/api/usage/count'])
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({version:USAGE_CONSENT_VERSION,acceptedAt:new Date().toISOString()}),setItem:()=>{},removeItem:()=>{}});request.mockRejectedValue(new Error('Offline'))
  expect(()=>usage.trackUsage('build_succeeded')).not.toThrow();expect(()=>usage.trackFirmwareDownload(['miniverb'],'octatrack')).not.toThrow();await Promise.resolve()
 })
})

describe('page traffic privacy and navigation', () => {
 it.each([false, true])('separates missing and unclassified pages without sending paths, opt-in=%s', optedIn => {
  if (optedIn) usage.setUsageAllowed(true)
  usage.trackPageView('new-screen/private-id?token=secret')
  usage.trackPageView('missing/private-id?token=secret', true)
  expect(request.mock.calls.map(([, options]) => JSON.parse(options.body).page)).toEqual(['unclassified', 'missing-page'])
  for (const [, options] of request.mock.calls) expect(options.body).not.toMatch(/private|secret|token/)
 })
 it.each([false, true])('sends only fixed page names with opt-in=%s', optedIn => {
  if (optedIn) usage.setUsageAllowed(true)
  for (const route of ['account/reset/private-token?email=private@example.test', 'forum/messages/private_username', 'forum/thread/private-id?search=secret', 'forum/profile/private_username', 'developer/private-report']) usage.trackPageView(route)
  expect(request.mock.calls.map(([, options]) => JSON.parse(options.body).page)).toEqual(['account', 'forum-messages', 'forum-thread', 'forum-profile', 'developer'])
  for (const [, options] of request.mock.calls) {
   expect(options.credentials).toBe('omit'); expect(options.referrerPolicy).toBe('no-referrer')
   expect(options.body).not.toMatch(/private|secret|email|username|token|search/)
  }
  if (!optedIn) expect(values.size).toBe(0)
 })
 it('ignores query changes and admin/review screens but counts separate visits within a page group', () => {
  for (const route of ['forum/thread/one', 'forum/thread/one?page=2', 'forum/thread/two', 'admin?tab=accounts', 'review/private', 'forum/thread/two']) usage.trackPageView(route)
  expect(request.mock.calls.map(([, options]) => JSON.parse(options.body))).toEqual(Array.from({length: 3}, () => ({event: 'page_view', page: 'forum-thread'})))
 })
})

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, hasSavedSession, onCommunityReconnect } from './api'
import type { DeveloperSession, PublishedModule, Session } from './api'
import { CommunityContext, emptyDeveloperSession, emptySession } from './context'
import { recheck } from './recheck'
import type { Recheck } from './recheck'
export function CommunityProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState(emptySession),[loading,setLoading]=useState(true),[settled,setSettled]=useState(()=>!hasSavedSession()),[developer,setDeveloper]=useState<DeveloperSession|null>(null),[catalog,setCatalog]=useState<PublishedModule[]>([])
 const active=useRef(true),sessionRequest=useRef<Promise<void>|null>(null),catalogRequest=useRef<Promise<void>|null>(null),developerRequest=useRef<Promise<void>|null>(null),sessionVersion=useRef(0),developerVersion=useRef(0),sessionRetry=useRef<Recheck|null>(null),developerRetry=useRef<Recheck|null>(null)
 const refreshCatalog=useCallback(()=>{
  if(catalogRequest.current)return catalogRequest.current
  const request=api<PublishedModule[]>('/catalog').then(items=>{if(active.current)setCatalog(items)}).catch(()=>{}).finally(()=>{catalogRequest.current=null})
  catalogRequest.current=request
  return request
 },[])
 const refreshDeveloper=useCallback((force=true)=>{
  if(!force&&developerRequest.current)return developerRequest.current
  const version=++developerVersion.current
  const request=api<DeveloperSession>('/developer/auth/session').then(value=>{if(active.current&&version===developerVersion.current){setDeveloper(value);developerRetry.current?.succeeded()}}).catch(()=>{if(active.current&&version===developerVersion.current){setDeveloper(previous=>force?emptyDeveloperSession:previous??emptyDeveloperSession);developerRetry.current?.failed()}}).finally(()=>{if(version===developerVersion.current)developerRequest.current=null})
  developerRequest.current=request
  return request
 },[])
 const refresh=useCallback((force=true)=>{
  if(!force&&sessionRequest.current)return sessionRequest.current
  // Explicit refreshes after account changes supersede older requests.
  const version=++sessionVersion.current
  setLoading(true)
  // Catalog availability must never invalidate an authenticated session.
  void refreshCatalog()
  // A background check that cannot reach the service keeps the session on screen and tries again shortly;
  // only an explicit refresh after an account change falls back to the signed-out state.
  const request=api<Session>('/auth/session').then(next=>{if(active.current&&version===sessionVersion.current){setSession(next);sessionRetry.current?.succeeded()}}).catch(()=>{if(active.current&&version===sessionVersion.current){if(force)setSession(emptySession);sessionRetry.current?.failed()}}).finally(()=>{if(version===sessionVersion.current){sessionRequest.current=null;if(active.current){setLoading(false);setSettled(true)}}})
  sessionRequest.current=request
  return request
 },[refreshCatalog])
 useEffect(()=>{
  active.current=true
  const retry=sessionRetry.current=recheck(()=>{void refresh(false)})
  void refresh(false)
  // A slow first check stops holding layouts back; the page then updates when the session arrives.
  const settle=window.setTimeout(()=>setSettled(true),1500)
  const resume=()=>{if(document.visibilityState==='visible')void refresh(false)}
  const changed=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith('octamod.community.session:'))void refresh()}
  // Another read reaching the service again ends this check's backoff at once.
  const reconnected=onCommunityReconnect(()=>{void refresh(false)})
  window.addEventListener('focus',resume);window.addEventListener('online',resume);window.addEventListener('storage',changed)
  return()=>{active.current=false;window.clearTimeout(settle);retry.cancel();reconnected();window.removeEventListener('focus',resume);window.removeEventListener('online',resume);window.removeEventListener('storage',changed)}
 },[refresh])
 useEffect(()=>{
  const load=()=>{void refreshDeveloper(false)},retry=developerRetry.current=recheck(load)
  const changed=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith('modwerk.developer.session:'))void refreshDeveloper()}
  const reconnected=onCommunityReconnect(load)
  load();window.addEventListener('focus',load);window.addEventListener('online',load);window.addEventListener('storage',changed)
  return()=>{retry.cancel();reconnected();window.removeEventListener('focus',load);window.removeEventListener('online',load);window.removeEventListener('storage',changed)}
 },[refreshDeveloper])
 return <CommunityContext.Provider value={{session,loading,settled,developer,catalog,refresh,refreshDeveloper}}>{children}</CommunityContext.Provider>
}

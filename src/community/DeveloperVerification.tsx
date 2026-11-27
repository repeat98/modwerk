import { useEffect, useRef, useState } from 'react'
import { api, post } from './api'
import { apiUrl, assetUrl } from '../hosting'
import { useCommunity } from './context'
import { Icon } from '../components/Icon'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'

const verifierKey='modwerk.developer.sign-in'
export function DeveloperVerification({route}:{route:string}) {
  const {developer,refreshDeveloper}=useCommunity()
  const [busy,setBusy]=useState(false),[error,setError]=useState('')
  const complete=route.startsWith('account/developer/complete/'),unlisted=route==='account/developer/unlisted'
  const completing=useRef(false)
  useEffect(()=>{
    if(!complete){completing.current=false;return}
    if(completing.current)return
    completing.current=true
    const code=route.split('/')[3]
    history.replaceState(null,'','#account/developer/complete')
    void (async()=>{
      try {
        const verifier=sessionStorage.getItem(verifierKey)
        await post('/developer/auth/complete',{code,verifier})
        sessionStorage.removeItem(verifierKey)
        await refreshDeveloper()
        window.location.assign('#developer')
      } catch(error){setError(error instanceof Error?error.message:'Unable to verify your developer account.')}
    })()
  },[complete,route,refreshDeveloper])
  async function verify(){
    setBusy(true);setError('')
    try {
      const verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('')
      sessionStorage.setItem(verifierKey,verifier)
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))),challenge=Array.from(digest,byte=>byte.toString(16).padStart(2,'0')).join('')
      window.location.assign(apiUrl('/developer/auth/start?challenge='+challenge))
    } catch(error){setError(error instanceof Error?error.message:'Unable to start GitHub verification.');setBusy(false)}
  }
  async function signOut(){
    setBusy(true);setError('')
    try{await api('/developer/auth/session',{method:'DELETE'});await refreshDeveloper()}
    catch(error){setError(error instanceof Error?error.message:'Unable to sign out of your developer account.')}
    finally{setBusy(false)}
  }
  return <section className="configuration-section developer-verification" aria-labelledby="developer-verification">
    <header className="developer-verification-heading"><span className="developer-verification-icon"><Icon name="shield" size={20}/></span><div><h2 id="developer-verification">Developer account</h2></div></header>
    {unlisted&&<p className="service-note" role="status">This GitHub account is not listed as an author or maintainer of a module in the catalog. Developer access becomes available after a reviewed module lists your GitHub handle.</p>}
    {error&&<p className="file-error" role="alert">{error}</p>}
    {complete?<><p className="developer-verification-copy" role="status">{error?'GitHub verification could not finish.':'Verifying your GitHub account…'}</p>{error&&<a className="button button-quiet" href="#account/developer">Try again</a>}</>:!developer?<p className="developer-verification-copy" role="status">Checking developer verification…</p>:developer.user?<><p className="developer-verification-copy">Your GitHub account matches a module in the catalog.</p><p className="success-note"><Icon name="check" size={16}/>Verified developer: @{developer.user.login}</p><div className="developer-verification-actions"><a className="button button-primary" href="#developer">Open creator settings<Icon name="arrow" size={16}/></a><button className="text-button" disabled={busy} onClick={()=>void signOut()}>Sign out of developer account</button></div></>:<><p className="developer-verification-copy">Set up module support links and access privately shared report details. Public developer work stays on GitHub. Verify the GitHub account listed as an author or maintainer in the module catalog.</p><div className="developer-verification-actions"><button className="button button-quiet" aria-label="Verify developer account with GitHub" disabled={!developer.available||busy} onClick={()=>void verify()}>{busy?'Opening GitHub…':'Verify with GitHub'}<Icon name="arrow" size={16}/></button></div>{!developer.available&&<p className="developer-verification-note" role="status">GitHub verification is currently unavailable. Please try again later.</p>}</>}
    <div className="developer-community">
      <p>Questions about contributing?</p>
      <a className="button button-quiet" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord (opens in a new tab)"><img src={assetUrl('auth/discord.svg')} width={18} height={18} alt="" aria-hidden="true"/>Join Discord<span aria-hidden="true">↗</span></a>
    </div>
  </section>
}

import { useEffect, useState } from 'react'
import { Icon } from '../components/Icon'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'
import { SUPPORT_URL } from '../config/support'
import { assetUrl } from '../hosting'
import { useCommunity } from './context'
import { hasSignupWelcome, takeSignupWelcome } from './member-access'
import { countSupportPrompt, trackUsage } from './usage'
import { answerSupportPrompt } from './support-prompt'

/** A quiet welcome on the page the new member was heading to, never another popup. */
export function SignupWelcome() {
  const { session } = useCommunity()
  const [preview] = useState(() => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === 'welcome')
  const [shown, setShown] = useState(() => preview || hasSignupWelcome())
  const verified = !!session.user?.verified, username = preview ? 'new_member' : session.user?.username
  useEffect(() => {
    if (!preview && shown && verified && username) takeSignupWelcome()
  }, [preview, shown, verified, username])
  if (!shown || !username || !preview && !verified) return null
  return <section className="signup-welcome" aria-labelledby="signup-welcome-title">
    <button type="button" className="icon-button signup-welcome-close" aria-label="Dismiss welcome message" onClick={() => setShown(false)}><Icon name="close" size={18} /></button>
    <h2 id="signup-welcome-title">Welcome to Modwerk, @{username}.</h2>
    <p>Your account is ready. Explore the modules, share what you build and make yourself at home.</p>
    <div className="signup-welcome-community">
      <div><h3>Meet the people building Modwerk</h3><p>Join our development Discord to share ideas, get help and say hello.</p></div>
      <a className="button development-discord-button" href={DEVELOPMENT_DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Join Discord (opens in a new tab)" onClick={() => { if (!preview) trackUsage('discord_welcome_join_clicked') }}><img src={assetUrl('auth/discord.svg')} width={20} height={15} alt="" aria-hidden="true" />Join Discord<span aria-hidden="true">↗</span></a>
    </div>
    <p className="signup-welcome-support">Enjoying Modwerk? <a href={SUPPORT_URL} target="_blank" rel="noreferrer" aria-label="Support on Ko-fi (opens in a new tab)" onClick={() => { if (!preview) { trackUsage('support_link_opened'); countSupportPrompt('welcome-kofi'); answerSupportPrompt('kofi') } }}><Icon name="heart" size={14} />Support on Ko-fi<span aria-hidden="true">↗</span></a><span className="subtle">Always optional.</span></p>
  </section>
}

import { useState } from 'react'
import { useCommunity } from './context'
import { hasBetaAccess } from './beta-access'
import type { BuiltModule } from './build-follow-up'
import { followDownloadedModules } from './download-follows'
import { rememberHardwareFeedback, type DownloadedBuild } from './hardware-feedback'
import { rememberPendingFollows } from './pending-follows'

/** Members follow what they download. Guests get the sign-up invitation instead, and the download is kept on this device until they join. */
export function useDownloadFollows() {
  const { session } = useCommunity()
  const [followNotice, setFollowNotice] = useState('')
  /** The invitation opens on a guest's first download; closing it leaves a smaller card, which can be closed for the visit. */
  const [invite, setInvite] = useState<{ modules: readonly BuiltModule[]; stage: 'dialog' | 'card' | 'closed' } | null>(null)
  function followDownloads(ids: readonly string[], build?: DownloadedBuild) {
    if (!ids.length) return
    if (!session.user?.verified) {
      rememberPendingFollows(ids, build)
      if (session.user) setFollowNotice('Verify your email on your account page and we’ll follow the modules you downloaded.')
      else setInvite(previous => previous ?? { modules: build?.modules ?? [], stage: 'dialog' })
      return
    }
    if (build) rememberHardwareFeedback(session.user.id, build)
    setFollowNotice('Saving module update preferences…')
    void followDownloadedModules(ids, hasBetaAccess(session)).then(result => {
      window.dispatchEvent(new Event('modwerk-module-updates'))
      setFollowNotice(result.failed ? 'Your download started, but update preferences could not be saved. Use Get update notifications on each module page.'
        : result.followed ? 'You’re following updates for downloaded modules. Unfollow on a module page to opt out.'
        : 'Your existing update opt-outs are kept. Use Get update notifications on a module page to follow again.')
    })
  }
  const closeInvite = () => setInvite(previous => previous && { ...previous, stage: 'card' })
  const closeCard = () => setInvite(previous => previous && { ...previous, stage: 'closed' })
  return { followDownloads, followNotice, invite, closeInvite, closeCard }
}

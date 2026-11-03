import { useState } from 'react'
import { useCommunity } from './context'
import { hasBetaAccess } from './beta-access'
import { followDownloadedModules } from './download-follows'
import { rememberHardwareFeedback, type DownloadedBuild } from './hardware-feedback'

export function useDownloadFollows() {
  const { session } = useCommunity()
  const [followNotice, setFollowNotice] = useState('')
  function followDownloads(ids: readonly string[], build?: DownloadedBuild) {
    if (!session.user?.verified || !ids.length) return
    if (build) rememberHardwareFeedback(session.user.id, build)
    setFollowNotice('Saving module update preferences…')
    void followDownloadedModules(ids, hasBetaAccess(session)).then(result => {
      window.dispatchEvent(new Event('modwerk-module-updates'))
      setFollowNotice(result.failed ? 'Your download started, but update preferences could not be saved. Use Get update notifications on each module page.'
        : result.followed ? 'You’re following updates for downloaded modules. Unfollow on a module page to opt out.'
        : 'Your existing update opt-outs are kept. Use Get update notifications on a module page to follow again.')
    })
  }
  return { followDownloads, followNotice }
}

import { post } from './api'
import { canTrackModuleDownload } from './module-downloads'

/** Account update subscriptions are independent of anonymous download statistics. */
export async function followDownloadedModules(moduleIds: readonly string[], betaAccess = false) {
  const ids = [...new Set(moduleIds)].filter(id => canTrackModuleDownload(id, betaAccess))
  const results = await Promise.allSettled(ids.map(id=>post<{enabled:boolean}>('/modules/'+id+'/download',{})))
  return { followed:results.filter(result=>result.status==='fulfilled'&&result.value.enabled).length,failed:results.some(result=>result.status==='rejected') }
}

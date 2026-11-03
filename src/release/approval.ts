export type MergeApproval = {
  kind: 'github-pr-merge'; repository: string; sourceCommit: string; baseRef: 'main'
  pullRequest: number; mergedBy: string; mergedById: number; moduleApproverId: number; mergedAt: string
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function releaseIdentity(repository: string, commit: string, ownerId: number) {
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[a-f0-9]{40}$/.test(commit) || !Number.isSafeInteger(ownerId) || ownerId < 1) throw new Error('Configure an exact repository, source commit and immutable owner GitHub ID.')
}
/** GitHub's own `merged` issue event names the merging account and the commit the merge created. The PR's
 *  `merge_commit_sha` is omitted for read-only tokens, so it is cross-checked only when present. */
export function ownerMergeApproval(pull: unknown, events: unknown, repository: string, commit: string, ownerId: number): MergeApproval {
  releaseIdentity(repository, commit, ownerId)
  const pr=object(pull),base=object(pr.base),repo=object(base.repo),merger=object(pr.merged_by)
  const merges=(Array.isArray(events)?events:[]).map(object).filter(event=>event.event==='merged')
  if (merges.length !== 1 || merges[0].commit_id !== commit || object(merges[0].actor).id !== ownerId || (pr.merge_commit_sha !== undefined && pr.merge_commit_sha !== null && pr.merge_commit_sha !== commit) || pr.merged !== true || pr.state !== 'closed' || base.ref !== 'main' || typeof repo.full_name !== 'string' || repo.full_name.toLowerCase() !== repository.toLowerCase() || merger.id !== ownerId || typeof merger.login !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(merger.login) || typeof pr.number !== 'number' || !Number.isSafeInteger(pr.number) || pr.number < 1 || typeof pr.merged_at !== 'string' || !Number.isFinite(Date.parse(pr.merged_at))) throw new Error('This exact main commit was not introduced by an owner-merged PR.')
  return {kind:'github-pr-merge',repository,sourceCommit:commit,baseRef:'main',pullRequest:pr.number,mergedBy:merger.login,mergedById:ownerId,moduleApproverId:ownerId,mergedAt:pr.merged_at}
}
export async function fetchOwnerApproval(repository: string, commit: string, ownerId: number, token='', attempts=7, retryMs=15000, backoffMs=2000): Promise<MergeApproval> {
  releaseIdentity(repository,commit,ownerId)
  const headers: Record<string,string>={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10'}
  if(token)headers.Authorization='Bearer '+token
  async function get(path:string) {
    let response:Response
    // GitHub's API answers 5xx or drops a connection now and then; one such blip must not fail a release.
    for(let retry=0;;retry++){
      const last=retry>=3
      try{response=await fetch('https://api.github.com/repos/'+repository+path,{headers,redirect:'error',signal:AbortSignal.timeout(10000)})}
      catch(error){if(last)throw error;await new Promise(resolve=>setTimeout(resolve,backoffMs*2**retry));continue}
      if(response.status<500||last)break
      await new Promise(resolve=>setTimeout(resolve,backoffMs*2**retry))
    }
    if(!response.ok)throw new Error('GitHub approval lookup failed: HTTP '+response.status)
    const text=await response.text();if(text.length>4*1024*1024)throw new Error('GitHub approval response is too large.')
    return JSON.parse(text) as unknown
  }
  for(let attempt=1;;attempt++){
    const list=await get('/commits/'+commit+'/pulls?per_page=100')
    if(!Array.isArray(list))throw new Error('GitHub did not return associated PRs.')
    for(const item of list){const number=object(item).number;if(typeof number!=='number'||!Number.isSafeInteger(number)||number<1)continue
      const pull=await get('/pulls/'+number),events=await get('/issues/'+number+'/events?per_page=100')
      try{return ownerMergeApproval(pull,events,repository,commit,ownerId)}catch{/* Associated open/stale PRs cannot approve this commit. */}
    }
    if(attempt>=attempts)break
    // A push to main can start this check seconds before GitHub links the merge commit to its PR.
    await new Promise(resolve=>setTimeout(resolve,retryMs))
  }
  throw new Error('No owner-merged PR approves this exact main commit; keep the previous publication.')
}

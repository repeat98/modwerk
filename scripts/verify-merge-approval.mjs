import {appendFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {fetchReleaseApproval,verifyUnreleased} from './release-approval.mjs'
// Fails the release job unless GitHub records an authorized merge of this exact commit and of every main commit since the last release.
const repository=process.env.GITHUB_REPOSITORY??'',head=process.env.GITHUB_SHA??'',ownerId=Number(process.env.OCTAMOD_APPROVER_ID),token=process.env.GITHUB_TOKEN??''
await verifyUnreleased({repository,last:process.env.OCTAMOD_LAST_RELEASE,head,ownerId,token,root:fileURLToPath(new URL('../',import.meta.url))})
const approval=await fetchReleaseApproval(repository,head,ownerId,token)
// The build marks a registered author's own release so the community API holds its follower notices.
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'author-modules='+(approval.authorization==='module-author'?approval.modules.join(','):'')+'\n')
console.log('GitHub release authorization verified for PR #'+approval.pullRequest+' at '+approval.sourceCommit+'.')

import {appendFileSync} from 'node:fs'
import {fetchReleaseApproval} from './release-approval.mjs'
// Fails the release job unless GitHub records an authorized merge of this exact commit.
const approval=await fetchReleaseApproval(process.env.GITHUB_REPOSITORY??'',process.env.GITHUB_SHA??'',Number(process.env.OCTAMOD_APPROVER_ID),process.env.GITHUB_TOKEN??'')
// The build marks a registered author's own release so the community API holds its follower notices.
if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'author-modules='+(approval.authorization==='module-author'?approval.modules.join(','):'')+'\n')
console.log('GitHub release authorization verified for PR #'+approval.pullRequest+' at '+approval.sourceCommit+'.')

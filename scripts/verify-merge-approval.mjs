import {fetchReleaseApproval} from './release-approval.mjs'
// Fails the release job unless GitHub records an authorized merge of this exact commit.
const approval=await fetchReleaseApproval(process.env.GITHUB_REPOSITORY??'',process.env.GITHUB_SHA??'',Number(process.env.OCTAMOD_APPROVER_ID),process.env.GITHUB_TOKEN??'')
console.log('GitHub release authorization verified for PR #'+approval.pullRequest+' at '+approval.sourceCommit+'.')

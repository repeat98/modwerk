import {afterEach,describe,expect,it,vi} from 'vitest'
import {fetchOwnerApproval,ownerMergeApproval} from './approval'
const commit='a'.repeat(40),repository='octamod/octamod',owner=42
const pull={number:7,merged:true,state:'closed',merge_commit_sha:commit,merged_at:'2026-10-01T01:00:00Z',base:{ref:'main',repo:{full_name:repository}},merged_by:{id:owner,login:'module-owner'}}
const events=[{event:'merged',commit_id:commit,actor:{id:owner}},{event:'closed',commit_id:null,actor:{id:owner}}]
afterEach(()=>{vi.unstubAllGlobals()})
describe('PR merge is version approval',()=>{
 it('binds approval to the exact merged commit and immutable owner ID',()=>expect(ownerMergeApproval(pull,events,repository,commit,owner)).toMatchObject({sourceCommit:commit,pullRequest:7,mergedById:42,baseRef:'main'}))
 it('accepts the merged event when a read-only token receives no merge_commit_sha',()=>{
  const withheld:Record<string,unknown>={...pull};delete withheld.merge_commit_sha
  expect(ownerMergeApproval(withheld,events,repository,commit,owner).sourceCommit).toBe(commit)
  expect(ownerMergeApproval({...pull,merge_commit_sha:null},events,repository,commit,owner).sourceCommit).toBe(commit)
 })
 it('rejects open PRs, another merger and changed source after approval',()=>{
  for(const value of [{...pull,merged:false},{...pull,state:'open'},{...pull,merged_by:{id:43,login:'module-owner'}},{...pull,merge_commit_sha:'b'.repeat(40)}])expect(()=>ownerMergeApproval(value,events,repository,commit,owner)).toThrow('owner-merged')
 })
 it('requires exactly one merged event for this commit by the owner',()=>{
  for(const value of [[],[{...events[0],commit_id:'b'.repeat(40)}],[{...events[0],actor:{id:43}}],[events[0],events[0]],[{...events[0],event:'closed'}],{event:'merged'}])expect(()=>ownerMergeApproval(pull,value,repository,commit,owner)).toThrow('owner-merged')
 })
 it('rejects a merge in another repository or branch',()=>{
  for(const base of [{...pull.base,ref:'development'},{ref:'main',repo:{full_name:'other/project'}}])expect(()=>ownerMergeApproval({...pull,base},events,repository,commit,owner)).toThrow('owner-merged')
 })
 it('requires exact commit IDs and a configured owner',()=>{
  expect(()=>ownerMergeApproval(pull,events,repository,'main',owner)).toThrow('immutable')
  expect(()=>ownerMergeApproval(pull,events,repository,commit,0)).toThrow('immutable')
 })
})
describe('GitHub approval lookup',()=>{
 function github(associatedAfter:number){
  let lookups=0
  const fetcher=vi.fn(async(url:string)=>{
   if(url.includes('/commits/'))return Response.json(++lookups>associatedAfter?[{number:7}]:[])
   if(url.endsWith('/pulls/7'))return Response.json(pull)
   if(url.includes('/issues/7/events'))return Response.json(events)
   return new Response('{}',{status:404})
  });vi.stubGlobal('fetch',fetcher);return fetcher
 }
 it('waits for GitHub to link a fresh merge commit to its PR',async()=>{
  github(2)
  expect((await fetchOwnerApproval(repository,commit,owner,'',4,0)).pullRequest).toBe(7)
 })
 it('retries a GitHub server error or dropped connection instead of failing the release',async()=>{
  const fetcher=github(0)
  fetcher.mockImplementationOnce(async()=>new Response('',{status:500})).mockImplementationOnce(async()=>{throw new TypeError('fetch failed')})
  expect((await fetchOwnerApproval(repository,commit,owner,'',1,0,0)).pullRequest).toBe(7)
  fetcher.mockImplementation(async()=>new Response('',{status:502}))
  await expect(fetchOwnerApproval(repository,commit,owner,'',1,0,0)).rejects.toThrow('HTTP 502')
 })
 it('does not retry a client error',async()=>{
  const fetcher=github(0)
  fetcher.mockImplementation(async()=>new Response('',{status:403}))
  await expect(fetchOwnerApproval(repository,commit,owner,'',1,0,0)).rejects.toThrow('HTTP 403')
  expect(fetcher).toHaveBeenCalledTimes(1)
 })
 it('keeps the previous publication when no owner-merged PR appears',async()=>{
  const fetcher=github(Infinity)
  await expect(fetchOwnerApproval(repository,commit,owner,'',3,0)).rejects.toThrow('keep the previous publication')
  expect(fetcher).toHaveBeenCalledTimes(3)
 })
})

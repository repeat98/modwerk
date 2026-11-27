import { useEffect, useState } from 'react'
import { api } from './api'
import { useReconnectRetry } from './useReconnectRetry'
import { FORUM_CATEGORIES, FORUM_CATEGORY_DESCRIPTIONS, type ForumCategorySummary, type ForumCategory } from './forum-contract'
import { Skeleton } from './ForumSkeleton'
import { Icon, type IconName } from '../components/Icon'

const icons:Record<ForumCategory,IconName>={general:'message',introductions:'heart',showcase:'wave',requests:'plus',tutorials:'file',modules:'help',configs:'sliders',issues:'shield'}
export function ForumDirectory({href,machine}:{href:(category:string)=>string;machine?:string}){
  const [data,setData]=useState<ForumCategorySummary[]|null>(null),[error,setError]=useState(''),[revision,setRevision]=useState(0)
  useEffect(()=>{let cancelled=false;void api<ForumCategorySummary[]>('/forum/categories'+(machine?'?machine='+machine:'')).then(value=>{if(!cancelled){setData(value);setError('')}}).catch(()=>{if(!cancelled)setError('Category counts are unavailable. You can still browse topics.')});return()=>{cancelled=true}},[machine,revision])
  useReconnectRetry(!!error,setRevision)
  return <section className="forum-directory" aria-labelledby="forum-directory-title"><div className="forum-list-heading"><h2 id="forum-directory-title">Topics</h2></div>
    <div className="forum-topic-grid">{Object.entries(FORUM_CATEGORIES).map(([key,label])=>{
      const count=data?.find(item=>item.category===key)
      return <a key={key} href={href(key)} className="forum-topic-card" data-category={key}><span className="forum-topic-icon"><Icon name={icons[key as ForumCategory]} size={16}/></span><div className="forum-topic-copy"><h3>{label}</h3><p>{FORUM_CATEGORY_DESCRIPTIONS[key as ForumCategory]}</p></div>{!error&&<small title={data?(count?.threads??0)+' '+(count?.threads===1?'discussion':'discussions')+' · '+(count?.replies??0)+' '+(count?.replies===1?'reply':'replies'):undefined}>{data?<>{count?.threads??0}<span className="sr-only"> {count?.threads===1?'discussion':'discussions'}</span></>:<Skeleton width="2ch"/>}</small>}</a>
    })}</div>{error&&<p className="service-note">{error}</p>}
  </section>
}

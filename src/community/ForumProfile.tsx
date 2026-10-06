import { useEffect, useState } from 'react'
import { api } from './api'
import { ForumAvatar } from './ForumIdentity'
type Profile = { username: string; displayName: string; bio: string; avatar: string | null }
export function ForumProfile({username}:{username:string}) {
  const [profile,setProfile]=useState<Profile|null>(null),[error,setError]=useState('')
  useEffect(()=>{let cancelled=false;void api<Profile>('/forum/profiles/'+encodeURIComponent(username)).then(value=>{if(!cancelled)setProfile(value)}).catch(error=>{if(!cancelled)setError(error.message)});return()=>{cancelled=true}},[username])
  return <section className="configuration-section forum-profile">{profile?<><ForumAvatar username={profile.username} avatar={profile.avatar}/><div><h2>{profile.displayName}</h2>{profile.bio&&<p className="profile-bio">{profile.bio}</p>}</div></>:<p role={error?'alert':'status'}>{error||'Loading member profile…'}</p>}</section>
}

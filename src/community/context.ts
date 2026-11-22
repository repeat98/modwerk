import { createContext, useContext } from 'react'
import type { DeveloperSession, PublishedModule, Session } from './api'
export const emptySession:Session={available:false,admin:false,user:null}
export const emptyDeveloperSession:DeveloperSession={available:false,user:null}
export const CommunityContext=createContext<{session:Session;loading?:boolean;/** False only while a stored session is being checked for the first time (at most 1.5 s), so layouts can wait for it. Absent means settled. */settled?:boolean;developer:DeveloperSession|null;catalog:PublishedModule[];refresh:()=>Promise<void>;refreshDeveloper:()=>Promise<void>;preview?:boolean}>({session:emptySession,developer:null,catalog:[],refresh:async()=>{},refreshDeveloper:async()=>{}})
export function useCommunity(){return useContext(CommunityContext)}

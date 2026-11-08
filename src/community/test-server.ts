import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { handleCommunity } from '../../server/transport'
import { digest } from '../../server/security'
import type { Database, Statement, Env } from '../../server/platform'
// Migrate once per test file; each database starts from a copy of that schema and seed data.
let migrated:Uint8Array|undefined
export function testDatabase(){
 const db=new DatabaseSync(':memory:')
 if(migrated)db.deserialize(migrated)
 else{for(const name of readdirSync(new URL('../../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));migrated=db.serialize()}
 function statement(sql:string,values:SQLInputValue[]=[]):Statement{return {bind(...args){if(args.length>100)throw new Error(`D1 allows at most 100 bound parameters, got ${args.length}`);return statement(sql,args as SQLInputValue[])},async first<T>(){return (db.prepare(sql).get(...values) as T|undefined)??null},async all<T>(){const results=db.prepare(sql).all(...values) as T[];const meta=db.prepare('SELECT changes() AS changes,last_insert_rowid() AS last_row_id').get();return {results,meta}},async run(){return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}}
 const adapter:Database & {exec(sql:string):Promise<unknown>}={prepare:statement,async exec(sql){db.exec(sql)},async batch(items){db.exec('BEGIN');try{const result=[];for(const item of items)result.push(await item.all());db.exec('COMMIT');return result}catch(error){db.exec('ROLLBACK');throw error}}}
 return {db,adapter}
}
export async function testServer(){
 const {db,adapter}=testDatabase(),env:Env={DB:adapter,APP_URL:'https://octamod.test/',SESSION_TRANSPORT:'bearer',REGISTRATION_OPEN:'true',PRIVACY_READY:'true',AUTH_SECRET:'only-a-test-secret-with-adequate-entropy-1234567890',RESEND_API_KEY:'test-resend-key',EMAIL_FROM:'Modwerk <accounts@notify.example.test>',ADMIN_KEY_SHA256:await digest('e'.repeat(64))}
 async function call(path:string,method='GET',body?:unknown,token='',admin='',origin='https://octamod.test'){
  const headers=new Headers({Origin:origin,'CF-Connecting-IP':'192.0.2.1'})
  if(body!==undefined)headers.set('Content-Type','application/json')
  if(token)headers.set('Authorization','Bearer '+token)
  if(admin)headers.set('X-Octamod-Admin',admin)
  const request=new Request('https://api.example.test/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})
  return handleCommunity(request,env)
 }
 return {db,env,call}
}

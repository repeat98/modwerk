import type { Database, Env, User } from './platform'
import { throttle } from './auth'
import { cookie, digest, getCookie, HttpError, jsonBody, response, token } from './security'
import { developerModules } from '../src/community/modules'

function configuration(env:Env) {
  if (!env.GITHUB_OAUTH_CLIENT_ID || !env.GITHUB_OAUTH_CLIENT_SECRET || !env.GITHUB_OAUTH_CALLBACK_URL) return null
  let callback:URL
  try {callback=new URL(env.GITHUB_OAUTH_CALLBACK_URL)} catch {return null}
  if (callback.pathname !== '/api/developer/auth/callback' || callback.search || callback.hash || callback.username || callback.password || (callback.protocol !== 'https:' && !(callback.protocol === 'http:' && ['localhost','127.0.0.1'].includes(callback.hostname)))) return null
  return {id:env.GITHUB_OAUTH_CLIENT_ID,secret:env.GITHUB_OAUTH_CLIENT_SECRET,callback:callback.href}
}
const clientHash = (env:Env) => digest(env.GITHUB_OAUTH_CLIENT_ID + ':' + env.GITHUB_OAUTH_CLIENT_SECRET)
export async function developerUser(request:Request,env:Env,db:Database):Promise<User|null> {
  const value=request.headers.get('X-Modwerk-Developer')??''
  if (!configuration(env) || !/^[a-f0-9]{64}$/.test(value)) return null
  const user=await db.prepare('SELECT u.id,u.display_name,u.github_id,u.github_login,u.suspended FROM users u JOIN developer_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.client_hash=? AND s.expires>? AND s.purpose=\'developer\' AND u.suspended=0 AND u.github_id IS NOT NULL').bind(await digest(value),await clientHash(env),Math.floor(Date.now()/1000)).first<User>()
  return user && developerModules(user.github_login).length ? user : null
}
async function github<T>(url:string,options:RequestInit):Promise<T> {
  try {
    // Return redirects for explicit rejection; never forward OAuth credentials to another URL.
    const result=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(10000)})
    if(!result.ok)throw new Error()
    return await result.json() as T
  } catch {throw new HttpError(502,'GitHub sign-in could not be completed. Try again.')}
}
function redirect(url:string,env:Env,state?:string) {
  const headers=new Headers({'Location':url,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})
  if(state!==undefined)headers.append('Set-Cookie',cookie('modwerk_developer_oauth',state,env,state?600:0))
  return new Response(null,{status:302,headers})
}
export async function developerAuthentication(request:Request,env:Env,db:Database):Promise<Response|null> {
  const url=new URL(request.url),path=url.pathname
  if(!path.startsWith('/api/developer/auth/'))return null
  if(path==='/api/developer/auth/session'&&request.method==='GET'){
    const user=await developerUser(request,env,db)
    return response({available:!!configuration(env),user:user?{login:user.github_login}:null})
  }
  if(path==='/api/developer/auth/session'&&request.method==='DELETE'){
    await db.prepare('DELETE FROM developer_sessions WHERE token_hash=?').bind(await digest(request.headers.get('X-Modwerk-Developer')??'')).run()
    const result=response({ok:true});result.headers.set('X-Modwerk-Developer','');return result
  }
  const config=configuration(env)
  if(!config)throw new HttpError(503,'Developer GitHub sign-in is not configured yet.')
  const now=Math.floor(Date.now()/1000)
  if(path==='/api/developer/auth/start'&&request.method==='GET'){
    if(url.origin!==new URL(config.callback).origin)throw new HttpError(400,'Use the configured developer sign-in endpoint.')
    const challenge=url.searchParams.get('challenge')??''
    if(!/^[a-f0-9]{64}$/.test(challenge))throw new HttpError(400,'Start GitHub verification from your account page.')
    // The board's terminal sign-in (scripts/agent-board.mjs) names the loopback port GitHub's answer returns to.
    const port=url.searchParams.has('port')?Number(url.searchParams.get('port')):null
    if(port!==null&&!(Number.isInteger(port)&&port>=1024&&port<=65535))throw new HttpError(400,'Start the board sign-in with npm run board -- login.')
    await throttle(db,'github-start:'+(request.headers.get('CF-Connecting-IP')??'local'),10,900)
    const state=token(),verifier=token(),bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)))
    const pkce=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
    await db.prepare('INSERT INTO developer_oauth_states(state_hash,verifier,browser_challenge,expires,return_port) VALUES(?,?,?,?,?)').bind(await digest(state),verifier,challenge,now+600,port).run()
    const authorize=new URL('https://github.com/login/oauth/authorize')
    for(const [key,value] of Object.entries({client_id:config.id,redirect_uri:config.callback,scope:'read:user',state,code_challenge:pkce,code_challenge_method:'S256',allow_signup:'false'}))authorize.searchParams.set(key,value)
    return redirect(authorize.href,env,state)
  }
  if(path==='/api/developer/auth/callback'&&request.method==='GET'){
    const state=url.searchParams.get('state')??'',code=url.searchParams.get('code')??''
    if(url.origin!==new URL(config.callback).origin || !/^[a-f0-9]{64}$/.test(state) || getCookie(request,'modwerk_developer_oauth')!==state)throw new HttpError(400,'GitHub sign-in state was not accepted. Start again.')
    const flow=await db.prepare('DELETE FROM developer_oauth_states WHERE state_hash=? AND expires>? RETURNING verifier,browser_challenge,return_port').bind(await digest(state),now).first<{verifier:string;browser_challenge:string;return_port:number|null}>()
    if(!flow)throw new HttpError(400,'GitHub sign-in expired or was already used. Start again.')
    const home=new URL(env.APP_URL!);home.hash='account/developer'
    const terminal=flow.return_port?'http://127.0.0.1:'+flow.return_port+'/callback':null
    if(url.searchParams.has('error'))return redirect(terminal?terminal+'?error=declined':home.href,env,'')
    if(!/^[a-zA-Z0-9_-]{1,256}$/.test(code))throw new HttpError(400,'GitHub did not provide a valid sign-in code.')
    const credential=await github<{access_token?:string;token_type?:string}>('https://github.com/login/oauth/access_token',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({client_id:config.id,client_secret:config.secret,redirect_uri:config.callback,code,code_verifier:flow.verifier})})
    if(!credential.access_token||credential.token_type!=='bearer')throw new HttpError(502,'GitHub sign-in was not accepted.')
    // Request identity only, without requesting, fetching or storing any email fields.
    const profile=await github<{data?:{viewer?:{databaseId?:number;login?:string}};errors?:unknown}>('https://api.github.com/graphql',{method:'POST',headers:{Authorization:'Bearer '+credential.access_token,'Content-Type':'application/json','User-Agent':'Modwerk developer sign-in'},body:JSON.stringify({query:'query ModwerkDeveloperIdentity { viewer { databaseId login } }'})})
    const viewer=profile.data?.viewer
    if(profile.errors||!viewer||!Number.isSafeInteger(viewer.databaseId)||(viewer.databaseId ?? 0) <= 0||typeof viewer.login!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(viewer.login))throw new HttpError(502,'GitHub identity could not be verified.')
    const githubId=String(viewer.databaseId),login=viewer.login.toLowerCase()
    // Any GitHub account may claim on the board; the creator routes stay with listed authors and maintainers.
    if(!terminal&&!developerModules(login).length){home.hash='account/developer/unlisted';return redirect(home.href,env,'')}
    // Stable GitHub ID owns the developer identity; names/emails never claim community accounts.
    const user=await db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?) ON CONFLICT(github_id) DO UPDATE SET github_login=excluded.github_login RETURNING id,suspended').bind(crypto.randomUUID(),'@'+login,githubId,login).first<{id:string;suspended:number}>()
    if(!user||user.suspended)throw new HttpError(403,'Developer access is suspended.')
    const handoff=token()
    await db.prepare('INSERT INTO developer_auth_codes(code_hash,user_id,browser_challenge,expires,purpose) VALUES(?,?,?,?,?)').bind(await digest(handoff),user.id,flow.browser_challenge,now+60,terminal?'board':'developer').run()
    if(terminal)return redirect(terminal+'?code='+handoff,env,'')
    home.hash='account/developer/complete/'+handoff
    return redirect(home.href,env,'')
  }
  if(path==='/api/developer/auth/complete'&&request.method==='POST'){
    const body=await jsonBody(request)
    if(typeof body.code!=='string'||!/^[a-f0-9]{64}$/.test(body.code)||typeof body.verifier!=='string'||!/^[a-f0-9]{64}$/.test(body.verifier))throw new HttpError(400,'GitHub sign-in could not be completed. Start again.')
    await throttle(db,'github-complete:'+(request.headers.get('CF-Connecting-IP')??'local'),10,900)
    const link=await db.prepare('DELETE FROM developer_auth_codes WHERE code_hash=? AND browser_challenge=? AND expires>? AND EXISTS(SELECT 1 FROM users WHERE id=developer_auth_codes.user_id AND suspended=0) RETURNING user_id,purpose').bind(await digest(body.code),await digest(body.verifier),now).first<{user_id:string;purpose:'developer'|'board'}>()
    if(!link)throw new HttpError(400,'GitHub sign-in expired or was already used. Start again.')
    const user=await db.prepare('SELECT github_login FROM users WHERE id=?').bind(link.user_id).first<{github_login:string|null}>()
    if(link.purpose==='developer'&&!developerModules(user?.github_login).length)throw new HttpError(403,'Your GitHub account is not listed as a module author or maintainer.')
    const session=token()
    // A board session lasts 30 days, so agents are not sent back to the browser every week; it opens only the board.
    await db.prepare('INSERT INTO developer_sessions(token_hash,user_id,client_hash,expires,purpose) VALUES(?,?,?,?,?)').bind(await digest(session),link.user_id,await clientHash(env),now+(link.purpose==='board'?30:7)*86400,link.purpose).run()
    const result=response({ok:true});result.headers.set('X-Modwerk-Developer',session);return result
  }
  throw new HttpError(404,'Developer sign-in route not found.')
}
export async function cleanupDeveloperAuth(db:Database){
  const now=Math.floor(Date.now()/1000)
  await db.batch(['developer_oauth_states','developer_auth_codes','developer_sessions'].map(table=>db.prepare(`DELETE FROM ${table} WHERE expires<=?`).bind(now)))
}

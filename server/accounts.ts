import { initializeNewsPreference, newsPreferences } from './news-preferences'
import { AsyncLocalStorage } from 'node:async_hooks'
import { betterAuth } from 'better-auth'
import { bearer } from 'better-auth/plugins/bearer'
import { username } from 'better-auth/plugins/username'
import { verifyPassword } from 'better-auth/crypto'
import { createAuthMiddleware, getOAuthState, isAPIError } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth'
import type { Env, Database, User } from './platform'
import { throttle } from './auth'
import { appOrigin, digest, HttpError, jsonBody, response, token as randomToken } from './security'
import { AccountMailError, emailReady, sendAccountEmail } from './email'
import { accountRequest } from './account-requests'
import { accountExport } from './account-export'
import { COMMUNITY_RULES_VERSION } from '../src/legal/policy'
import { googleTokenBinding, socialOptions, suggestUsername, validUsername } from './social-config'

export function authReady(env: Env) { return !!env.AUTH_SECRET && env.AUTH_SECRET.length >= 32 }
const authInstances = new AsyncLocalStorage<Map<Database, { settings: string; auth: ReturnType<typeof createAccountAuth> }>>()
const accountUsers = new WeakMap<Request, { db: Database; settings: string; user: Promise<User|null> }>()
/** Adapter initialization and connection locks must belong to one Worker invocation. */
export function withAccountAuth<T>(operation:()=>T):T { return authInstances.run(new Map(),operation) }
function authSettings(env: Env) {
  return JSON.stringify(Object.entries(env).filter(([,value]) => typeof value === 'string').sort(([a],[b]) => a.localeCompare(b)))
}
/** Reuse the adapter within a request, never across requests that may be canceled. */
export function accountAuth(env: Env, db: Database) {
  const settings = authSettings(env), instances = authInstances.getStore(), cached = instances?.get(db)
  if (cached?.settings === settings) return cached.auth
  const auth = createAccountAuth(env,db)
  instances?.set(db,{settings,auth})
  return auth
}
function createAccountAuth(env: Env, db: Database) {
  if (!authReady(env)) throw new HttpError(503,'Accounts are not configured yet.')
  const syncPublicUser = async (user:{id:string;name:string;username?:string|null;emailVerified:boolean}) => {
    await db.prepare('INSERT INTO users(id,display_name,username,email_verified) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,email_verified=excluded.email_verified').bind(user.id,user.name,user.username??user.name,Number(user.emailVerified)).run()
  }
  return betterAuth({
    appName:'Modwerk', baseURL:env.AUTH_BASE_URL??new URL('/api/auth',env.APP_URL!).href, secret:env.AUTH_SECRET,
    database:db as unknown as NonNullable<BetterAuthOptions['database']>, trustedOrigins:[appOrigin(env)],
    user:{modelName:'auth_users',validateUserInfo:({user,source})=>{if(source.oauth&&!user.emailVerified)return {error:'email_not_verified',errorDescription:'Verify your email with the sign-in provider first.'}}},
    account:{modelName:'auth_accounts',accountLinking:{enabled:false},encryptOAuthTokens:true},
    socialProviders:socialOptions(env),
    session:{modelName:'auth_sessions',expiresIn:7*86400,updateAge:86400,cookieCache:{enabled:false}},
    verification:{modelName:'auth_verifications',storeIdentifier:'hashed'},
    // Only our explicit facade below is exposed; it applies persistent D1/IP/address throttles.
    rateLimit:{enabled:false}, logger:{disabled:true},
    // Versioned migrations own the schema; avoid background introspection that can outlive a request.
    advanced:{database:{validateSchema:false},cookiePrefix:'octamod-account',ipAddress:{ipAddressHeaders:['cf-connecting-ip']}},
    emailAndPassword:{enabled:true,minPasswordLength:15,maxPasswordLength:128,requireEmailVerification:true,autoSignIn:false,resetPasswordTokenExpiresIn:1800,revokeSessionsOnPasswordReset:true,
      sendResetPassword:async({user,token})=>{await sendAccountEmail(env,db,user.email,'reset',token)},
      onPasswordReset:async({user})=>{await db.batch([db.prepare('DELETE FROM account_tokens WHERE user_id=?').bind(user.id),db.prepare('DELETE FROM auth_verifications WHERE value=?').bind(user.id),db.prepare('UPDATE auth_users SET emailVerified=1 WHERE id=?').bind(user.id),db.prepare('UPDATE users SET email_verified=1 WHERE id=?').bind(user.id)])},
    },
    emailVerification:{sendOnSignUp:true,sendOnSignIn:false,expiresIn:86400,autoSignInAfterVerification:false,
      sendVerificationEmail:async({user,token})=>{
        // Library JWTs can repeat within one second. A fresh nonce makes every
        // resend distinct, and only the hashed complete action link is accepted.
        const actionToken=token+'~'+randomToken()
        await db.batch([db.prepare('DELETE FROM account_tokens WHERE user_id=? AND purpose=\'verify\'').bind(user.id),db.prepare('INSERT INTO account_tokens(token_hash,user_id,purpose,expires) VALUES(?,?,\'verify\',?)').bind(await digest(actionToken),user.id,Math.floor(Date.now()/1000)+86400)])
        await sendAccountEmail(env,db,user.email,'verify',actionToken)
      },
    },
    plugins:[bearer({requireSignature:true}),username({minUsernameLength:3,maxUsernameLength:24,usernameValidator:validUsername}),googleTokenBinding()],
    hooks:{after:createAuthMiddleware(async ctx=>{
      if(ctx.path==='/callback/:id'){const state=await getOAuthState<{flowHash?:string}>();if(state?.flowHash)ctx.setHeader('X-Modwerk-Sso-Flow',state.flowHash)}
    })},
    databaseHooks:{
      user:{create:{before:async(user,ctx)=>{
        if(ctx?.path!=='/callback/:id')return
        const state=await getOAuthState<{flowHash?:string}>()
        const flow=state?.flowHash?await db.prepare("SELECT username,rules_version FROM social_flows WHERE token_hash=? AND stage='started' AND expires>?").bind(state.flowHash,Math.floor(Date.now()/1000)).first<{username:string|null;rules_version:string|null}>():null
        if(env.REGISTRATION_OPEN!=='true'||env.PRIVACY_READY!=='true'||!flow)return false
        if(flow.username&&(flow.rules_version!==COMMUNITY_RULES_VERSION||!validUsername(flow.username)))return false
        let publicName=flow.username
        if(!publicName&&(ctx?.params?.id==='github'||ctx?.params?.id==='discord')){
          const suggestion=suggestUsername(user.name)
          if(suggestion&&!await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').bind(suggestion).first())publicName=suggestion
        }
        if(!publicName){
          // Never derive a public name from a provider's real name or private email.
          do { publicName='member_'+randomToken().slice(0,12) } while(await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').bind(publicName).first())
        }
        return {data:{...user,name:publicName,username:publicName,displayUsername:publicName,image:null}}
      },after:async(user,ctx)=>{
        await syncPublicUser(user)
        if(ctx?.path==='/callback/:id'){
          const state=await getOAuthState<{flowHash?:string}>()
          const flow=state?.flowHash?await db.prepare("SELECT username,rules_version,newsletter FROM social_flows WHERE token_hash=? AND stage='started'").bind(state.flowHash).first<{username:string|null;rules_version:string|null;newsletter:number}>():null
          if(!flow?.username||flow.rules_version!==COMMUNITY_RULES_VERSION){
            await db.prepare('INSERT INTO social_pending_accounts(user_id,expires) VALUES(?,?)').bind(user.id,Math.floor(Date.now()/1000)+600).run()
            return
          }
          await initializeNewsPreference(db,user.id,flow.newsletter===1)
        }
        await db.prepare('INSERT OR IGNORE INTO account_policy_acceptances(user_id,version) VALUES(?,?)').bind(user.id,COMMUNITY_RULES_VERSION).run()
      }},update:{after:syncPublicUser}},
      session:{create:{before:async(session,ctx)=>{
        const user=await db.prepare('SELECT suspended FROM users WHERE id=?').bind(session.userId).first<{suspended:number}>()
        if(!user||user.suspended)return false
        if(await db.prepare('SELECT user_id FROM social_pending_accounts WHERE user_id=?').bind(session.userId).first()){
          if(ctx?.path!=='/callback/:id'||env.REGISTRATION_OPEN!=='true'||env.PRIVACY_READY!=='true')return false
          await db.prepare('UPDATE social_pending_accounts SET expires=? WHERE user_id=?').bind(Math.floor(Date.now()/1000)+600,session.userId).run()
        }
        return {data:{...session,ipAddress:null,userAgent:null}}
      }}},
    },
  })
}
export async function accountUser(request: Request, env: Env, db: Database): Promise<User|null> {
  if(!authReady(env))return null
  // Guest tokens and anonymous reads do not need the account adapter at all.
  if(!request.headers.get('Authorization')?.includes('.')&&!request.headers.get('Cookie')?.includes('octamod-account'))return null
  const settings=authSettings(env),cached=accountUsers.get(request)
  if(cached?.db===db&&cached.settings===settings)return cached.user
  const user=(async()=>{
    const session=await accountAuth(env,db).api.getSession({headers:request.headers})
    if(!session?.user.emailVerified)return null
    return db.prepare('SELECT id,display_name,username,avatar_id,email_verified,suspended,is_admin FROM users WHERE id=? AND suspended=0 AND NOT EXISTS(SELECT 1 FROM social_pending_accounts p WHERE p.user_id=users.id)').bind(session.user.id).first<User>()
  })()
  accountUsers.set(request,{db,settings,user})
  return user
}
function emailAddress(value:unknown){if(typeof value!=='string'||value.trim().length>254||!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim()))throw new HttpError(400,'Enter a valid email address.');return value.trim().toLowerCase()}
const genericMessage='If the address is eligible, an email will arrive shortly. Check your spam folder. You can request another message or reset your password if you already have an account.'
export async function accountRoutes(request: Request, env: Env, db: Database, path: string): Promise<Response|null> {
  if(path==='/api/auth/news')return newsPreferences(request,db,await accountUser(request,env,db))
  if(path==='/api/auth/data-export'||path==='/api/auth/account-removal'){
    const owner=await accountUser(request,env,db),session=owner?await accountAuth(env,db).api.getSession({headers:request.headers}):null
    return path==='/api/auth/data-export'?accountExport(request,db,owner,session?.session.createdAt):accountRequest(request,db,owner,session?.session.createdAt)
  }
  const route=path.match(/^\/api\/auth\/(register|login|resend|forgot|verify|reset|sessions|logout)$/)
  if(!route)return null
  const action=route[1]
  if(action==='register'&&(env.REGISTRATION_OPEN!=='true'||env.PRIVACY_READY!=='true'))throw new HttpError(503,'New registrations are temporarily closed. Existing accounts can still sign in and recover access.')
  if(action==='logout'&&!authReady(env))return null
  if(action==='logout'&&!request.headers.get('Authorization')?.includes('.')&&!request.headers.get('Cookie')?.includes('octamod-account'))return null
  const auth=accountAuth(env,db),headers=request.headers
  try{
    if(action==='sessions'){
      if(!await accountUser(request,env,db))throw new HttpError(401,'Sign in to manage sessions.')
      if(request.method==='GET'){
        const own=await auth.api.getSession({headers}),sessions=await auth.api.listSessions({headers})
        return response(sessions.map(item=>({id:item.id,current:item.id===own?.session.id,expires:Math.floor(new Date(item.expiresAt).getTime()/1000)})))
      }
      if(request.method==='DELETE'){await auth.api.revokeOtherSessions({headers});return response({ok:true})}
      return null
    }
    if(request.method!=='POST')return null
    if(action==='logout'){
      const result=await auth.api.signOut({headers,asResponse:true}),out=response({ok:true})
      out.headers.set('X-Octamod-Session','')
      if(env.SESSION_TRANSPORT!=='bearer')for(const value of result.headers.getSetCookie())out.headers.append('Set-Cookie',value)
      return out
    }
    await throttle(db,'auth-ip:'+(headers.get('CF-Connecting-IP')??'local'),30,900)
    const body=await jsonBody(request)
    if(action==='verify'||action==='reset'){
      if(typeof body.token!=='string'||body.token.length<20||body.token.length>2000)throw new HttpError(400,'This link is invalid or expired.')
      if(typeof body.password!=='string'||body.password.length<15||body.password.length>128)throw new HttpError(400,'Use a password between 15 and 128 characters.')
      if(action==='verify'){
        const tokenHash=await digest(body.token),now=Math.floor(Date.now()/1000)
        const record=await db.prepare('SELECT a.password,t.user_id FROM account_tokens t JOIN auth_accounts a ON a.userId=t.user_id JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires>? AND t.purpose=\'verify\' AND a.providerId=\'credential\' AND u.suspended=0').bind(tokenHash,now).first<{password:string;user_id:string}>()
        if(!record||!await verifyPassword({hash:record.password,password:body.password}))throw new HttpError(400,'The link or password was not accepted. Use your registration password, or request a reset.')
        const consumed=await db.prepare('DELETE FROM account_tokens WHERE token_hash=? AND expires>? RETURNING user_id').bind(tokenHash,now).first()
        if(!consumed)throw new HttpError(400,'This link has already been used.')
        await auth.api.verifyEmail({query:{token:body.token.split('~')[0]},headers})
      }else await auth.api.resetPassword({body:{token:body.token,newPassword:body.password},headers})
      return response({ok:true,message:action==='verify'?'Email verified. You can now sign in.':'Password updated. All previous sessions have ended. Sign in with your new password.'})
    }
    const email=emailAddress(body.email)
    await throttle(db,(action==='login'?'auth-login:':'auth-mail:')+email,action==='login'?10:3,900)
    if(action!=='login'&&!emailReady(env))throw new HttpError(503,'Account email is not connected yet. Please try again later.')
    if(action==='login'){
      if(typeof body.password!=='string'||body.password.length>128)throw new HttpError(400,'Enter your password.')
      const result=await auth.api.signInEmail({body:{email,password:body.password},headers,asResponse:true})
      if(!result.ok)throw new HttpError(result.status,result.status===403?'Verify your email first, or request another verification message.':'Email or password was not accepted.')
      const out=response({ok:true}),value=result.headers.get('set-auth-token')
      if(env.SESSION_TRANSPORT==='bearer'){if(!value)throw new HttpError(500,'Sign-in could not be completed.');out.headers.set('X-Octamod-Session',value)}
      else for(const value of result.headers.getSetCookie())out.headers.append('Set-Cookie',value)
      return out
    }
    if(action==='register'){
      if(body.rulesVersion!==COMMUNITY_RULES_VERSION)throw new HttpError(400,'Read and accept the current community rules before creating an account.')
      if(typeof body.username!=='string'||!/^[a-zA-Z0-9_]{3,24}$/.test(body.username))throw new HttpError(400,'Use 3–24 letters, numbers or underscores for your username.')
      if(typeof body.password!=='string')throw new HttpError(400,'Enter a password.')
      if(body.newsletter!==undefined&&typeof body.newsletter!=='boolean')throw new HttpError(400,'Choose whether to receive news emails.')
      const created=await auth.api.signUpEmail({body:{name:body.username.toLowerCase(),username:body.username.toLowerCase(),email,password:body.password},headers})
      await initializeNewsPreference(db,created.user.id,body.newsletter===true)
    }else if(action==='forgot')await auth.api.requestPasswordReset({body:{email},headers})
    else await auth.api.sendVerificationEmail({body:{email},headers})
    return response({message:genericMessage},202)
  }catch(error){
    // Delivery outcomes must not disclose whether an address owns an account.
    if(error instanceof AccountMailError)return response({message:genericMessage},202)
    if(isAPIError(error))throw new HttpError(error.statusCode,error.body?.message??'This account request was not accepted.')
    throw error
  }
}
// Better Auth writes its date columns as ISO-8601 text on SQLite, and SQLite orders any text above any
// integer, so a numeric comparison alone never matches. Compare text as text and keep the numeric form
// for rows written as epoch milliseconds.
const AUTH_EXPIRED="CASE typeof(expiresAt) WHEN 'text' THEN expiresAt<=? ELSE expiresAt<=? END"
export async function cleanupAccounts(db:Database){
 const now=Math.floor(Date.now()/1000),iso=new Date(now*1000).toISOString()
 // Pending identities cannot publish or build, so no public contributions need retention.
 await db.batch([
  db.prepare('DELETE FROM users WHERE id IN(SELECT user_id FROM social_pending_accounts WHERE expires<=?)').bind(now),
  db.prepare('DELETE FROM auth_users WHERE id IN(SELECT user_id FROM social_pending_accounts WHERE expires<=?)').bind(now),
  db.prepare('DELETE FROM social_flows WHERE expires<=?').bind(now),
 ])
  await db.batch([db.prepare('DELETE FROM account_tokens WHERE expires<=?').bind(now),db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now),db.prepare('DELETE FROM rate_limits WHERE expires<=?').bind(now),db.prepare('DELETE FROM admin_sessions WHERE expires<=?').bind(now),db.prepare('DELETE FROM auth_sessions WHERE '+AUTH_EXPIRED).bind(iso,now*1000),db.prepare('DELETE FROM auth_verifications WHERE '+AUTH_EXPIRED).bind(iso,now*1000)])
}

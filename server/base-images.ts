// Hosted base images (docs/HOSTED_BASES.md): prebuilt Modwerk bases for makers who agreed, built and uploaded only by
// the owner (scripts/base-publish.mjs) into the private BASES bucket. The manifest is public; an image needs a member.
import type { Env, User } from './platform'
import { needMember } from './auth'
import { HttpError, response } from './security'

export const BASE_MANIFEST_KEY = 'manifest.json'
export interface HostedBase { machine: string; identity: string; sha256: string; size: number; file: string; step?: boolean; layout?: string }
export interface HostedBaseManifest { schema: 1; images: HostedBase[] }
const IMAGE = /^\/api\/bases\/([a-z0-9-]{1,40})\/([a-f0-9]{64})$/
export const baseImageKey = (image: Pick<HostedBase, 'machine' | 'identity'>) => image.machine + '/' + image.identity

async function manifest(env: Env): Promise<HostedBaseManifest> {
  const object = await env.BASES?.get(BASE_MANIFEST_KEY)
  if (!object) return { schema: 1, images: [] }
  const parsed = await new Response(object.body).json() as HostedBaseManifest
  return parsed?.schema === 1 && Array.isArray(parsed.images) ? parsed : { schema: 1, images: [] }
}

export async function baseImageRoutes(request: Request, env: Env, user: User | null): Promise<Response | null> {
  const path = new URL(request.url).pathname
  if (request.method !== 'GET' || (path !== '/api/bases' && !IMAGE.test(path))) return null
  if (path === '/api/bases') return response(await manifest(env))
  needMember(user)
  const [, machine, identity] = path.match(IMAGE)!
  const entry = (await manifest(env)).images.find(image => image.machine === machine && image.identity === identity)
  const object = entry ? await env.BASES?.get(baseImageKey(entry)) : null
  if (!entry || !object) throw new HttpError(404, 'This base is not hosted. Build it from your own OS file instead.')
  // An identity names exactly one image, so it never changes under the same address.
  return new Response(object.body, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + entry.file.replace(/[^A-Za-z0-9._-]/g, '_') + '"', 'X-Base-SHA256': entry.sha256, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=31536000, immutable' } })
}

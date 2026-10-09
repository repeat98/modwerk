// Fetch the repository's own GitHub Open Graph preview. This is a maintenance command;
// browsing and production builds use the checked-in cache and never contact GitHub for images.
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import sharp from 'sharp'
import { EXTERNAL_PROJECTS } from '../src/projects/projects.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const imageHosts = new Set(['opengraph.githubassets.com', 'repository-images.githubusercontent.com', 'github.com', 'raw.githubusercontent.com', 'avatars.githubusercontent.com'])
// Prefer the project's actual README screenshot where available. The TouchOSC
// layout has no artwork, so its creator's GitHub image is the upstream fallback.
const sourceImages = {
  'https://github.com/davidferlay/octatrack-manager': { url: 'https://raw.githubusercontent.com/davidferlay/octatrack-manager/main/user-guide/static/img/project-discovery.png', kind: 'readme-screenshot' },
  'https://github.com/designerfuzzi/OctobusAdditions': { url: 'https://avatars.githubusercontent.com/designerfuzzi?size=640', kind: 'creator-image' },
}
const manifest = resolve(root, 'src/projects/thumbnails.json')
const thumbnails = await readFile(manifest, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error })
await mkdir(resolve(root, 'public/project-thumbnails'), { recursive: true })

async function response(url, image = false) {
  let result
  for (let attempt = 0; attempt < 4; attempt++) {
    result = await fetch(url, { headers: { 'User-Agent': 'Modwerk-project-directory' }, signal: AbortSignal.timeout(30000) })
    if (![429, 502, 503].includes(result.status) || attempt === 3) break
    await result.body?.cancel()
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
  }
  if (!result.ok) throw new Error(`${url}: HTTP ${result.status}`)
  if (image && (!imageHosts.has(new URL(result.url).hostname) || !result.headers.get('content-type')?.startsWith('image/'))) throw new Error('Unexpected image response: ' + result.url)
  return result
}

async function thumbnail(project) {
  const html = await (await response(project.repository)).text()
  const tag = html.match(/<meta\b[^>]*property="og:image"[^>]*>/i)?.[0]
  const override = sourceImages[project.repository]
  const imageUrl = override?.url ?? tag?.match(/\bcontent="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&')
  if (!imageUrl || new URL(imageUrl).protocol !== 'https:' || !imageHosts.has(new URL(imageUrl).hostname)) throw new Error('Missing or unexpected GitHub preview: ' + project.repository)
  const source = Buffer.from(await (await response(imageUrl, true)).arrayBuffer())
  if (source.length > 10 * 1024 * 1024) throw new Error('Oversized preview: ' + project.repository)
  const { data, info } = await sharp(source, { limitInputPixels: 16777216 }).resize({ width: 640, height: 360, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 86, progressive: true }).toBuffer({ resolveWithObject: true })
  const hash = createHash('sha256').update(data).digest('hex')
  const slug = project.repository.slice('https://github.com/'.length).replace('/', '--').toLowerCase()
  const src = `project-thumbnails/${slug}-${hash.slice(0, 12)}.jpg`
  await writeFile(resolve(root, 'public', src), data)
  thumbnails[project.repository] = { src, source: project.repository, imageUrl, ...(override ? { kind: override.kind } : {}), width: info.width, height: info.height, sha256: hash, fetchedAt: new Date().toISOString().slice(0, 10) }
  await save()
  console.log('Cached GitHub preview: ' + project.name)
}

async function save() {
  const sorted = Object.fromEntries(EXTERNAL_PROJECTS.filter(project => thumbnails[project.repository]).map(project => [project.repository, thumbnails[project.repository]]).sort(([a], [b]) => a.localeCompare(b, 'en')))
  await writeFile(manifest, JSON.stringify(sorted, null, 2) + '\n')
}

// Sequential requests respect GitHub's preview generator; successful fetches are
// saved immediately so a transient failure can be resumed. --refresh updates the cache.
const failures = []
for (const project of EXTERNAL_PROJECTS) {
  if (thumbnails[project.repository] && !process.argv.includes('--refresh')) continue
  try { await thumbnail(project) } catch (error) { failures.push(project.name + ': ' + error.message); console.error(failures.at(-1)) }
}
if (failures.length) throw new Error('Missing previews: ' + failures.join('; '))
await save()
const used = new Set(EXTERNAL_PROJECTS.map(project => thumbnails[project.repository].src.split('/').at(-1)))
for (const file of await readdir(resolve(root, 'public/project-thumbnails'))) {
  if (/^[\w-]+-[a-f0-9]{12}\.jpg$/.test(file) && !used.has(file)) await unlink(resolve(root, 'public/project-thumbnails', file))
}
console.log(`Saved ${EXTERNAL_PROJECTS.length} repository previews and their source metadata.`)

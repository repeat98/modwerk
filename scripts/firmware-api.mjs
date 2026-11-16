// SPDX-License-Identifier: GPL-3.0-or-later
import { createServer } from 'node:http'
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildAndSave, parseBuildRequest, readOptions, siteBase } from './firmware-download.mjs'
import { sha256 } from './firmware-build-manifest.mjs'

async function jsonBody(request) {
  const chunks = []; let length = 0
  for await (const chunk of request) {
    length += chunk.length
    if (length > 16 * 1024) throw new Error('Build request exceeds 16 KiB.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Only loopback; callers choose modules, never server-side filesystem paths or fetch destinations. */
export async function startFirmwareApi({ stockPath, outputDir, site = 'https://modwerk.app/', port = 8789, build = buildAndSave }) {
  if (!stockPath || !outputDir || !Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Choose a stock file, private output directory and valid port.')
  const base = siteBase(site).href, token = randomBytes(32).toString('hex'), downloads = new Map()
  let busy = false, url
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)) }
    // Reject website fetches, including same-loopback pages. CLI requests carry no Origin.
    if (request.headers.origin || request.headers.host !== new URL(url).host) return json(403, { error: 'Only direct loopback API clients are allowed.' })
    const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + token)
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(401, { error: 'A local API token is required.' })
    if (request.url === '/health' && request.method === 'GET') return json(200, { ok: true, busy, machines: ['digitakt', 'digitone'] })
    const download = /^\/downloads\/([a-f0-9-]{36})\/(\d+)$/.exec(request.url ?? '')
    if (download && request.method === 'GET') {
      const file = downloads.get(download[1])?.files[Number(download[2])]
      if (!file) return json(404, { error: 'Unknown download.' })
      try {
        const bytes = await readFile(file.path)
        if (sha256(bytes) !== file.sha256 || bytes.length !== file.bytes) return json(409, { error: 'The saved download changed. Build again.' })
        response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + basename(file.path).replace(/["\r\n]/g, '_') + '"', 'Content-Length': bytes.length, 'X-Firmware-SHA256': file.sha256 })
        response.end(bytes)
      } catch { json(404, { error: 'The saved download is unavailable.' }) }
      return
    }
    if (request.url !== '/build-download' || request.method !== 'POST') return json(404, { error: 'Use GET /health, POST /build-download or a returned download URL.' })
    if (request.headers['content-type']?.split(';')[0] !== 'application/json') return json(415, { error: 'Use application/json.' })
    if (busy) return json(409, { error: 'A firmware build is already running.' })
    busy = true
    try {
      const body = parseBuildRequest(await jsonBody(request))
      const receipt = await build(body, { stockPath, outputDir, site: base })
      const id = randomUUID()
      downloads.set(id, receipt)
      if (downloads.size > 100) downloads.delete(downloads.keys().next().value)
      json(201, { ...receipt, downloadId: id, files: receipt.files.map((file, index) => ({ ...file, url: url + '/downloads/' + id + '/' + index })) })
    } catch (error) { json(400, { error: error.message }) }
    finally { busy = false }
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept) })
  url = 'http://127.0.0.1:' + server.address().port
  let credentialsDir
  try {
    credentialsDir = await mkdtemp(join(tmpdir(), 'modwerk-firmware-api-'))
    const credentialsPath = join(credentialsDir, 'credentials.json')
    await writeFile(credentialsPath, JSON.stringify({ url, token }) + '\n', { mode: 0o600, flag: 'wx' })
    return { server, url, credentialsPath, close: async () => { await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())); await rm(credentialsDir, { recursive: true, force: true }) } }
  } catch (error) { server.close(); if (credentialsDir) await rm(credentialsDir, { recursive: true, force: true }); throw error }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = readOptions(process.argv.slice(2))
    if (Object.keys(options).some(key => !['stock', 'output', 'site', 'port'].includes(key))) throw new Error('Unknown server option.')
    const api = await startFirmwareApi({ stockPath: options.stock && resolve(options.stock), outputDir: options.output && resolve(options.output), site: options.site, port: options.port === undefined ? 8789 : Number(options.port) })
    console.log(JSON.stringify({ url: api.url, credentialsPath: api.credentialsPath }))
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void api.close().catch(error => { console.error(error.message); process.exitCode = 1 }) })
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

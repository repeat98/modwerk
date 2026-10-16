// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit local evidence command for the Syntakt boot probe. Never run in CI or a visitor build: it reads the owner's
// stock OS files, links the probe, checks every stock write, rebuilds the container and writes the result plus a JSON
// record of hashes, layout and margins (no firmware bytes) to a local folder.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { buildSyntaktBootProbe } from '../src/engine/elektron/syntakt.ts'

const args = process.argv.slice(2), values = name => args.flatMap((arg, i) => arg === name ? [args[i + 1]] : []), one = name => values(name)[0]
if (!one('--out') || !values('--firmware').length) throw new Error('Usage: verify-syntakt-core-probe.mjs --out LOCAL_DIR --firmware Syntakt_OS.syx [--firmware ...]')
const output = resolve(one('--out')), sha = bytes => createHash('sha256').update(bytes).digest('hex'), cases = []
await mkdir(output, { recursive: true })
for (const path of values('--firmware')) {
  const raw = new Uint8Array(await readFile(path))
  const { release, linked, writes, syx, facts, stockMargin } = await buildSyntaktBootProbe(raw)
  const name = 'syntakt-' + release + '-boot-probe.syx'
  await writeFile(resolve(output, name), syx)
  const result = { machine: 'syntakt', release, stock: basename(path), stockSha256: sha(raw), stage: 'boot-probe', providesInterface: false, containerVerified: true,
    buildSha256: sha(syx), imageSha256: sha(linked.image), writes, layout: linked.layout, facts, stockInplaceMargin: stockMargin, hardware: 'not tested' }
  cases.push(result)
  console.log('syntakt ' + release + ': boot probe linked (' + writes.sites + ' site, ' + writes.tail + ' tail bytes), container verified, in-place margin ' + facts.inplaceGap + ' (stock ' + stockMargin + '); hardware evidence still required')
}
await writeFile(resolve(output, 'boot-probes.json'), JSON.stringify({ cases }, null, 2) + '\n')

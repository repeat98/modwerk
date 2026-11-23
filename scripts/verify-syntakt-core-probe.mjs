// SPDX-License-Identifier: GPL-3.0-or-later
// Explicit local evidence command for the Syntakt boot probe. Never run in CI or a visitor build: it reads the owner's
// stock OS files, links the probe, checks every stock write, rebuilds the container and writes the result plus a JSON
// record of hashes, layout and margins (no firmware bytes) to a local folder.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import synfact from '../sdk/syntakt/core/synfact-ui.json' with { type: 'json' }
import stock from '../sdk/syntakt/core/stock-map.json' with { type: 'json' }
import { ELE3_DEVICES, mainImage, readEle3Syx } from '../src/engine/elektron/ele3.ts'
import { wholeInstructions } from '../src/engine/elektron/coldfire-isa.ts'
import { buildSyntaktBootProbe } from '../src/engine/elektron/syntakt.ts'

const args = process.argv.slice(2), values = name => args.flatMap((arg, i) => arg === name ? [args[i + 1]] : []), one = name => values(name)[0]
if (!one('--out') || !values('--firmware').length) throw new Error('Usage: verify-syntakt-core-probe.mjs --out LOCAL_DIR --firmware Syntakt_OS.syx [--firmware ...] [--synfact]')
const output = resolve(one('--out')), sha = bytes => createHash('sha256').update(bytes).digest('hex'), cases = []
await mkdir(output, { recursive: true })
for (const path of values('--firmware')) {
  const raw = new Uint8Array(await readFile(path))
  let synfactUi
  if (args.includes('--synfact')) {
    const release = stock.releases[synfact.os]
    if (sha(raw) !== release.syxSha256) throw new Error('Synfact UI guards require the exact stock Syntakt OS ' + synfact.os + ' file.')
    const device = ELE3_DEVICES.syntakt, image = mainImage(readEle3Syx(raw), device)
    for (const site of synfact.sites) {
      const addr = Number(site.addr), offset = addr - device.mainLoad
      const guard = sha(image.subarray(offset, offset + site.length))
      if (guard !== site.stockSha256 || !wholeInstructions(image, device.mainLoad, addr, site.length).ok)
        throw new Error('Synfact ' + site.event + ' guard or instruction boundary mismatch at ' + site.addr)
    }
    synfactUi = synfact
    console.log('Verified ' + synfact.sites.length + ' Synfact core ' + synfact.core + ' UI sites against stock ' + synfact.os + '.')
  }
  const { release, linked, writes, syx, facts, stockMargin } = await buildSyntaktBootProbe(raw)
  const name = 'syntakt-' + release + '-boot-probe.syx'
  await writeFile(resolve(output, name), syx)
  const result = { machine: 'syntakt', release, stock: basename(path), stockSha256: sha(raw), stage: 'boot-probe', ...(synfactUi && { synfactUi }), providesInterface: false, containerVerified: true,
    buildSha256: sha(syx), imageSha256: sha(linked.image), writes, layout: linked.layout, facts, stockInplaceMargin: stockMargin, hardware: 'not tested' }
  cases.push(result)
  console.log('syntakt ' + release + ': boot probe linked (' + writes.sites + ' site, ' + writes.tail + ' tail bytes), container verified, in-place margin ' + facts.inplaceGap + ' (stock ' + stockMargin + '); hardware evidence still required')
}
await writeFile(resolve(output, 'boot-probes.json'), JSON.stringify({ cases }, null, 2) + '\n')

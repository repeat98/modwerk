// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Local-only regression. Read the owner's original firmware; retain no firmware or stock bytes.
// node scripts/verify-placement-diagnostics.mjs /local/OCTATRACK_OS1.40C.bin
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

if (process.argv.length !== 3) throw new Error('Usage: node scripts/verify-placement-diagnostics.mjs /local/OCTATRACK_OS1.40C.bin')
const input = new Uint8Array(readFileSync(process.argv[2]))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const before = sha(input)
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' })
try {
  const { createEngineSession } = await server.ssrLoadModule('/src/engine/session.ts')
  const replies = [], handle = createEngineSession(response => replies.push(response))
  await handle({ id: 1, type: 'inspect', buffer: input.buffer, name: 'OCTATRACK_OS1.40C.bin' })
  assert.equal(replies.at(-1).type, 'inspection')
  const ids = ['miniverb', 'tapeecho', 'euclid', 'repitch', 'tapehead', 'analog-bassdrum', 'previewvol', 'sidechain-compressor', 'playmodes', 'mute-modes', 'recorder-loop-fix']
  const started = performance.now()
  await handle({ id: 2, type: 'validate', moduleIds: ids, keepStockFx2: false })
  const response = replies.at(-1)
  assert.equal(response.type, 'error')
  assert.equal(response.conflict.id, 'build-placement-space')
  assert.deepEqual(response.conflict.moduleIds, ['mute-modes'])
  assert.match(response.message, /208 bytes needed, 60 bytes available/)
  assert.match(response.message, /Removing one module is insufficient/)
  assert.deepEqual(response.conflict.fixes.map(fix => [...fix.removeIds].sort()).sort(), ['miniverb', 'euclid', 'tapehead', 'sidechain-compressor'].map(id => [id, 'mute-modes'].sort()).sort())
  console.log('Reported eleven-module selection: named Mute Modes overflow; four verified two-module fixes in ' + Math.round(performance.now() - started) + 'ms.')
  let requestId = 3
  for (const fix of response.conflict.fixes) {
    const remaining = ids.filter(id => !fix.removeIds.includes(id))
    await handle({ id: requestId++, type: 'validate', moduleIds: remaining, keepStockFx2: false })
    assert.equal(replies.at(-1).type, 'validated', fix.label)
    assert.deepEqual([...replies.at(-1).report.moduleIds].sort(), [...remaining].sort())
  }
  const remaining = ids.filter(id => !['mute-modes', 'euclid'].includes(id))
  await handle({ id: requestId++, type: 'build', moduleIds: remaining, keepStockFx2: false })
  assert.equal(replies.at(-1).type, 'built')
  assert.equal(sha(new Uint8Array(replies.at(-1).buffer)), replies.at(-1).sha256)
  assert.equal(sha(input), before)
  await handle({ id: requestId++, type: 'clear' })
  await handle({ id: requestId++, type: 'validate', moduleIds: remaining, keepStockFx2: false })
  assert.equal(replies.at(-1).type, 'error')
  assert.equal(replies.at(-1).conflict, undefined)
  console.log('All four fixes validate; the Euclid + Mute Modes fix builds and verifies a complete upgrade; original input and stale-base guards passed. No hardware/audio test ran.')
} finally { await server.close() }

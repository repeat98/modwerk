// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Secrets go to an ignored file, never stdout, Git, or VITE_* frontend variables.
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const key = privateKey.export({ format: 'jwk' })
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(key.x, 'base64url'), Buffer.from(key.y, 'base64url')]).toString('base64url')
const target = resolve('.push-secrets.json')
try { writeFileSync(target, JSON.stringify({ VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: key.d, VAPID_SUBJECT: 'https://modwerk.app/' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
catch (error) { if (error.code === 'EEXIST') { console.error('A push key file already exists. Keep the existing keys; rotating them requires devices to subscribe again.'); process.exit(1) } throw error }
console.log('Push keys saved to the ignored .push-secrets.json file. Follow docs/WEB_PUSH.md for setup.')

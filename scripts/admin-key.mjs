// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Generates a separate administrator key for the community backend. Nothing is written to disk.
// Give the key only to the administrator; configure the backend with its SHA-256 (ADMIN_KEY_SHA256).
import { createHash, randomBytes } from 'node:crypto'
const key = randomBytes(32).toString('hex')
console.log('Administrator key (store in a password manager, never in the repository):\n  ' + key)
console.log('Backend secret ADMIN_KEY_SHA256:\n  ' + createHash('sha256').update(key).digest('hex'))
console.log('Cloudflare: npx wrangler secret put ADMIN_KEY_SHA256 --config wrangler.worker.jsonc')

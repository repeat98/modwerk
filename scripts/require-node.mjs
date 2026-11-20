// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Stops npm ci and npm run prepare under a Node older than .nvmrc's, with the fix, before anything else fails less clearly
// (under Node 20, prepare's .ts step failed with an unknown file extension, and a new developer's agent read that as a broken
// checkout). Plain JavaScript that every Node version can parse.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** The message for a Node older than `wanted`, or null when `running` is new enough. */
export function nodeVersionProblem(running, wanted) {
  const major = Number(String(running).replace(/^v/, '').split('.')[0])
  if (major >= wanted) return null
  return `Modwerk needs Node ${wanted} (.nvmrc), but this shell runs Node ${String(running).replace(/^v/, '')}.\n` +
    `  With nvm: nvm install ${wanted} && nvm use ${wanted}, then run this again.\n` +
    `  So every new shell starts with it: nvm alias default ${wanted}.`
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const wanted = Number(readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim().replace(/^v/, '').split('.')[0])
  const problem = nodeVersionProblem(process.version, wanted)
  if (problem) { console.error(problem); process.exit(1) }
}

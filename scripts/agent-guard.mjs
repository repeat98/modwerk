#!/usr/bin/env node
// SPDX-License-Identifier: Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// Claude Code's PreToolUse hook for Bash (.claude/settings.json): refuses the commands that stall an agent's session or hold
// the unit far longer than anyone asked. Exit 2 refuses the call, and the agent reads the reason. A command the developer
// asked for in so many words runs with MODWERK_GUARD=off in front of it.
import { readFileSync } from 'node:fs'

const OPTIONS_WITH_VALUES = new Set(['--out', '--base', '--scene', '--seconds', '--slot', '--socket', '--share'])

/** Why the call is refused, or null. input: the hook's JSON ({ tool_input: { command, run_in_background } }). */
export function refusal(input) {
  const command = String(input?.tool_input?.command ?? ''), background = Boolean(input?.tool_input?.run_in_background)
  if (/(^|[\s;&|(])MODWERK_GUARD=off\s/.test(command)) return null
  // A here-document and quoted text are values, never commands (a commit message may name tail -f): one placeholder word
  // each, so option values still pair with their option.
  const plain = command.replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2(?=\s|\)|$)/g, 'Q').replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, 'Q')
  const detached = /&\s*$/.test(plain) || /\bnohup\b/.test(plain)

  if (!background && !detached) {
    const endless = /\btail\b[^;&|]*?\s(?:-\w*[fF]\w*|--follow)\b/.test(plain) ? 'tail -f'
      : /\bnpm\s+run\s+(dev|dev:community|preview)\b/.exec(plain)?.[0] ?? /\bdevice\s+--\s+serve\b|\bdevice\.mjs\s+serve\b/.exec(plain)?.[0] ?? /\bwrangler\s+dev\b/.exec(plain)?.[0]
    if (endless) return endless + ' never ends on its own, so it holds this session until the tool times out. Run it with run_in_background, and read its output when it tells you something.'
    const slept = [...plain.matchAll(/\bsleep\s+(\d+(?:\.\d+)?)([smh]?)\b/g)].reduce((sum, [, n, unit]) => sum + Number(n) * ({ m: 60, h: 3600 }[unit] ?? 1), 0)
    if (slept > 60) return 'this waits ' + slept + ' s in sleeps. Wait for the thing itself instead: run the job with run_in_background (you are told when it ends), or poll its condition in an until-loop with a short sleep.'
  }

  // The owner, 16 November 2026: a trial on the unit lasts about two minutes, not 25.
  for (const [, seconds] of plain.matchAll(/\bdevice(?:\.mjs|\s+--)\s+(?:try|set)\b[^;&|]*?--seconds[\s=]+(\d+)/g)) {
    if (Number(seconds) > 120) return 'a ' + seconds + ' s trial holds the unit; trials last about two minutes (--seconds 120 or less, owner, 16 November 2026). Fit the work into a shorter trial.'
  }
  // device:price with no module measures every USB package, one trial each: the unit is held for most of an hour. Only a run
  // counts: grep, node --check or a test naming the script is not one.
  for (const [, rest] of plain.matchAll(/(?:\bnpm\s+run\s+device:price|\bnode\s+(?:-(?!-check\b|c\b)\S+\s+)*(?:\S*\/)?scripts\/octatrack-price\.mjs)\b([^;&|]*)/g)) {
    const words = rest.split(/\s+/).filter(word => word && word !== '--'), named = []
    for (let i = 0; i < words.length; i++) {
      if (OPTIONS_WITH_VALUES.has(words[i])) i++
      else if (!words[i].startsWith('-')) named.push(words[i])
    }
    if (!named.length) return 'device:price with no module measures every USB package, one trial after another, and holds the unit for most of an hour. Name the modules: npm run device:price -- [options] ID|FILE.mwrm…'
  }
  return null
}

if (import.meta.filename === process.argv[1]) {
  let input = null
  try { input = JSON.parse(readFileSync(0, 'utf8')) } catch { process.exit(0) } // not a hook call this guard understands: let it run
  const reason = refusal(input)
  if (reason) {
    console.error('Refused by scripts/agent-guard.mjs: ' + reason + ' If the developer asked for exactly this command, put MODWERK_GUARD=off in front of it.')
    process.exit(2)
  }
}

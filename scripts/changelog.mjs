import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The application changelog, one file per entry under changelog/ so pull requests never edit the same lines.
 * CHANGELOG.md keeps the entries up to 22 October 2026; `npm run changelog` prints both, newest first. */
export const ENTRIES = 'changelog'
const NAME = /^(\d{4})-(\d{2})-(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MOVE = 'Put a new changelog entry in its own file, changelog/<YYYY-MM-DD>-<topic>.md (for example changelog/2026-10-23-merge-when-green.md), instead of CHANGELOG.md, so pull requests stop conflicting on it.'

export function readEntries(root) {
  const entries = []
  let names
  try { names = readdirSync(join(root, ENTRIES)).sort() } catch (error) { if (error.code === 'ENOENT') return entries; throw error }
  for (const name of names) {
    if (name.startsWith('.')) continue
    const match = NAME.exec(name), where = ENTRIES + '/' + name
    if (!match) throw new Error(`${where}: name each entry <YYYY-MM-DD>-<topic>.md, in lowercase words joined by hyphens.`)
    const [year, month, day] = match.slice(1).map(Number), date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(`${where}: ${match.slice(1).join('-')} is not a date.`)
    const text = readFileSync(join(root, ENTRIES, name), 'utf8').trim()
    if (!text) throw new Error(`${where}: the entry is empty.`)
    if (/^#/m.test(text)) throw new Error(`${where}: leave out headings; the date heading comes from the file name.`)
    entries.push({ name, date: match.slice(1).join('-'), heading: `${day} ${MONTHS[month - 1]} ${year}`, text: text.startsWith('- ') ? text : '- ' + text })
  }
  return entries
}

/** The whole changelog as one Markdown document: entries by day, newest day first, then CHANGELOG.md's history. */
export function renderChangelog(root) {
  const days = new Map()
  for (const entry of readEntries(root).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))) {
    if (!days.has(entry.heading)) days.set(entry.heading, [])
    days.get(entry.heading).push(entry.text)
  }
  const history = readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), start = history.search(/^## /m)
  const recent = [...days].map(([heading, texts]) => `## ${heading}\n\n${texts.join('\n\n')}\n`)
  return ['# Application changelog\n', ...recent, start < 0 ? '' : history.slice(start)].filter(Boolean).join('\n')
}

/** A frozen log keeps its history: since the base commit, no line may add an entry (`- `) or a section (`## `) to it. */
export function refuseNewEntries(root, base, file, message) {
  const diff = execFileSync('git', ['diff', '--no-ext-diff', '--unified=0', base, '--', file], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  if (diff.split('\n').some(line => /^\+(- |## )/.test(line))) throw new Error(file + ': ' + message)
}

/** Entries are well formed, and with a base commit, no new entry or day was added to the frozen CHANGELOG.md. */
export function checkChangelog(root, base = null) {
  const entries = readEntries(root)
  if (base) refuseNewEntries(root, base, 'CHANGELOG.md', MOVE)
  return { entries: entries.length }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  try {
    if (process.argv.includes('--check')) {
      const index = process.argv.indexOf('--base')
      console.log(`Application changelog: ${checkChangelog(root, index < 0 ? null : process.argv[index + 1]).entries} entries in ${ENTRIES}/`)
    } else process.stdout.write(renderChangelog(root))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}

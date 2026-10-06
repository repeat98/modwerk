import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LIBRARY_CATEGORIES } from './modules'

const root = fileURLToPath(new URL('../../', import.meta.url)), guides = resolve(root, 'docs/module-guides')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const categoryGuides = LIBRARY_CATEGORIES.map(category => category + '.md'), allGuides = ['README.md', 'sequencing.md', ...categoryGuides]
const find = (directory: string, name: string): boolean => readdirSync(directory).some(entry => { const path = resolve(directory, entry); return statSync(path).isDirectory() ? find(path, name) : entry === name })

describe('module guides', () => {
  it('has a guide for every library category, the sequencing guide and the index, and nothing else', () => {
    expect(readdirSync(guides).sort()).toEqual([...allGuides].sort())
    const index = read('docs/module-guides/README.md')
    for (const guide of allGuides.filter(name => name !== 'README.md')) expect(index, guide + ' must be linked from the index').toContain('(' + guide + ')')
  })
  it('gives every guide the checklists an agent walks', () => {
    for (const guide of categoryGuides) {
      const text = read('docs/module-guides/' + guide)
      for (const heading of ['## Behave like the instrument', '## Integrate', '## Digitakt and Digitone']) expect(text, guide + ' needs ' + heading).toContain(heading)
      expect(text.match(/^- \[ \] /gm)?.length ?? 0, guide + ' needs checklist items').toBeGreaterThanOrEqual(6)
      expect(text, guide + ' must end integration with the doctor').toContain('module:doctor')
    }
    const sequencing = read('docs/module-guides/sequencing.md')
    for (const word of ['transport', 'tempo', 'track speed', 'swing', 'Euclid']) expect(sequencing).toContain(word)
  })
  it('points sequencing from every guide whose modules act in time', () => {
    for (const guide of ['effects.md', 'machines.md', 'playback.md', 'midi-usb.md', 'system.md']) expect(read('docs/module-guides/' + guide), guide).toContain('sequencing.md')
  })
  it('links only to files that exist and names only tools that exist', () => {
    for (const guide of allGuides) {
      const text = read('docs/module-guides/' + guide)
      for (const [, target] of text.matchAll(/\]\((?!https?:|#)([^)#\s]+)/g)) expect(existsSync(resolve(guides, target)), guide + ' links to ' + target).toBe(true)
      for (const [, token] of text.matchAll(/`([^`]+)`/g)) {
        const word = token.split(/\s+/)[0]
        if (/[<*]|\.\.\./.test(word) || word.endsWith(':')) continue
        if (/^(sdk|docs|scripts|src|vendor)\//.test(word)) expect(existsSync(resolve(root, word)), guide + ' names ' + word).toBe(true)
        else if (/^tools\//.test(word)) expect(existsSync(resolve(root, 'sdk/octabam', word)), guide + ' names ' + word).toBe(true)
        else if (/^[a-z_0-9]+\.py$/.test(word)) expect(find(resolve(root, 'sdk/octabam/tools'), word), guide + ' names ' + word).toBe(true)
      }
    }
  })
  it('is read automatically: the agent files, the scaffolder and the pull request template point at it', () => {
    for (const file of ['AGENTS.md', 'sdk/AGENTS.md']) expect(read(file), file).toContain('module-guides')
    expect(read('sdk/AGENTS.md')).toContain('@../docs/module-guides/README.md')
    expect(read('sdk/CLAUDE.md').trim()).toBe('@AGENTS.md')
    expect(read('.github/pull_request_template.md')).toContain('module-guides')
    expect(read('scripts/scaffold-module.mjs')).toContain('docs/module-guides/')
    expect(read('docs/ADD_A_MODULE.md')).toContain('module-guides/README.md')
  })
})

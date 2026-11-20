import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { UnreadableSetsNote } from './UnreadableSetsNote'

const render = (sets: { name: string; reason: string }[]) => renderToStaticMarkup(createElement(UnreadableSetsNote, { sets, set: 'module set', plural: 'module sets' }))

describe('saved sets this version cannot open', () => {
  it('names each set and why it cannot open', () => {
    const html = render([{ name: 'Live', reason: 'Unknown module: spectrum' }, { name: '', reason: 'A saved configuration is unreadable.' }])
    expect(html).toContain('2 saved module sets use a module or setting this version of Modwerk cannot open. They stay on this device')
    expect(html).toContain('“Live”: Unknown module: spectrum')
    expect(html).toContain('Unnamed module set: A saved configuration is unreadable.')
  })
  it('shows nothing when every set opened', () => { expect(render([])).toBe('') })
})

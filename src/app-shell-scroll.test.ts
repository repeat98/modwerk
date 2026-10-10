import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')
const rule = (selector: string) => css.split('\n').find(line => line.startsWith(selector + ' {')) ?? ''

// scrollIntoView scrolls every scrollable ancestor, and an `overflow: hidden` box counts as scrollable. Jumping to the USB setup panel
// (or the credits, a forum post, an issue report) used to scroll the shell by the toolbar's height and leave a gap under the status bar.
describe('app shell scrolling', () => {
  it.each(['.app-shell', '.workspace'])('%s cannot be scrolled programmatically, so only the content pane scrolls', selector => {
    expect(rule(selector)).toMatch(/overflow: clip/)
  })
  it('keeps the content pane as the one scroller', () => {
    expect(rule('.workspace-content')).toMatch(/overflow-y: auto/)
  })
})

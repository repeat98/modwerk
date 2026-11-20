// @vitest-environment jsdom
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ModuleAuthors } from './ModuleAuthors'
import { MODULES } from '../catalog/modules'
import { communityModule, developerModules } from '../community/modules'

describe('multiple module credits', () => {
  it('puts each contributor on a new line after the author and keeps support beside the owner', () => {
    const element = document.createElement('div')
    element.innerHTML = renderToStaticMarkup(createElement(ModuleAuthors, {
      name: 'Sam Banks', url: 'https://github.com/sambanks', by: true, arrows: true,
      contributors: [{ github: 'bryantysinger', name: 'Bryan Tysinger' }, { github: 'tester-two' }],
    }, createElement('button', {}, 'Support the creator')))
    expect([...element.querySelectorAll('.module-author-line')].map(line => line.textContent)).toEqual([
      'by Sam Banks ↗Support the creator', 'by Bryan Tysinger ↗', 'by tester-two ↗',
    ])
    expect(element.querySelectorAll('a')[1].href).toBe('https://github.com/bryantysinger')
    expect(element.querySelectorAll('.module-author-line button')).toHaveLength(1)
  })

  it('credits Sam and Bryan on Recorder Loop Fix after the maintainer opts out', () => {
    const module = MODULES.find(module => module.id === 'recorder-loop-fix')!
    expect(module.contributors).toEqual([{ github: 'bryantysinger', name: 'Bryan Tysinger' }])
    expect(module).toMatchObject({ author: 'sambanks', authorName: 'Sam Banks' })
    expect(communityModule(module.id)?.maintainers).toEqual([])
    expect(developerModules('sambanks')).toEqual([])
    expect(developerModules('bryantysinger').map(module => module.id)).toEqual(['lofi2', 'vibrato'])
  })
})

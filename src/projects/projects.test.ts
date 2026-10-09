import { createElement } from 'react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ProjectsPage } from './ProjectsPage'
import { EXTERNAL_PROJECTS, PROJECT_MACHINES, PROJECT_TYPES, filterProjects, projectMachineForDevice } from './projects'
import thumbnails from './thumbnails.json'

describe('external project directory', () => {
  it('keeps unique, attributed repository links and known discovery tags', () => {
    expect(new Set(EXTERNAL_PROJECTS.map(item => item.repository)).size).toBe(EXTERNAL_PROJECTS.length)
    for (const item of EXTERNAL_PROJECTS) {
      expect(item.repository).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w.-]+$/)
      expect(new URL(item.repository).pathname.split('/')[1]).toBe(item.author)
      expect(PROJECT_TYPES).toHaveProperty(item.type)
      expect(item.machines.length).toBeGreaterThan(0)
      for (const machine of item.machines) expect(PROJECT_MACHINES).toHaveProperty(machine)
    }
    for (const name of ['DigiSophie', 'digislicer', 'digineighbor', 'digitables', 'digihealth', 'midisc']) {
      expect(EXTERNAL_PROJECTS.some(item => item.name.toLowerCase() === name.toLowerCase())).toBe(false)
    }
  })

  it('combines instrument, type and multi-word search, including author names', () => {
    expect(filterProjects('  DIGIALCHEMYDSP  modulation ', 'digitone', 'mod').map(item => item.name)).toEqual(['Tone+FX'])
    expect(filterProjects('monomachine', 'all', 'emulator').map(item => item.name)).toEqual(['Monomodule'])
    expect(filterProjects('Tone+FX', 'octatrack')).toEqual([])
    expect(filterProjects('no such project')).toEqual([])
    expect(projectMachineForDevice('analog-rytm-mkii')).toBe('analog-rytm')
    expect(projectMachineForDevice('analog-keys')).toBe('analog-four')
    expect(projectMachineForDevice('tonverk')).toBeUndefined()
  })

  it('ships a source-attributed local GitHub preview for every project', () => {
    expect(Object.keys(thumbnails)).toHaveLength(EXTERNAL_PROJECTS.length)
    for (const project of EXTERNAL_PROJECTS) {
      const image = (thumbnails as Record<string, { src: string; source: string; imageUrl: string; sha256: string }>)[project.repository]
      expect(image.source).toBe(project.repository)
      expect(image.imageUrl).toMatch(/^https:\/\/(opengraph\.githubassets\.com|repository-images\.githubusercontent\.com|github\.com|raw\.githubusercontent\.com|avatars\.githubusercontent\.com)\//)
      expect(image.src).toMatch(/^project-thumbnails\/[\w-]+\.jpg$/)
      const bytes = readFileSync(new URL('../../public/' + image.src, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(image.sha256)
    }
  })

  it('offers outbound discovery without firmware-selection or download actions', () => {
    const html = renderToStaticMarkup(createElement(ProjectsPage, { route: 'projects?machine=digitakt-ii' }))
    expect(html).toContain('These projects cannot be added to a Modwerk configuration.')
    expect(html).toContain('Digitakt II Perform')
    expect(html).not.toContain('Tone+FX')
    expect(html).not.toContain('Add to configuration')
    expect(html).not.toContain('Build firmware')
    expect(html).not.toContain(' download=')
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('Filter projects by instrument')
    expect(html).toContain('Filter projects by type')
    expect(html).toContain('Clear filters')
    const invalid = renderToStaticMarkup(createElement(ProjectsPage, { route: 'projects?machine=unknown' }))
    expect(invalid).toContain('Tone+FX')
    expect(html).toContain('Want me to add your project?')
    expect(html).toContain('mailto:jannik.assfalg@gmail.com?subject=')
  })
})

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SubmissionPage } from './SubmissionPage'
import { DEVELOPMENT_DISCORD_URL } from '../config/development-discord'

describe('development Discord on the submit page', () => {
  it.each(['', 'miniverb', 'digitakt-digihealth', 'digitone-digihealth'])('links the development invite from %s', moduleId => {
    const html = renderToStaticMarkup(createElement(SubmissionPage, { moduleId }))
    expect(html).toContain('href="' + DEVELOPMENT_DISCORD_URL + '" target="_blank" rel="noreferrer"')
    expect(html).toMatch(/development Discord|Join Discord/i)
    expect(html).not.toContain('discord.gg/mb7B2N7A7')
    expect(html).toMatch(/href="https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+" target="_blank" rel="noreferrer"[^>]*>Modwerk on GitHub/)
  })
})

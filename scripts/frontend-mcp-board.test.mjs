import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createFrontendTools } from './frontend-mcp.mjs'

it('carries parent tasks, independent evidence and inactivity hints through the developer MCP', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'modwerk-board-work-'))
  const sessionFile = join(workspace, 'credentials.json')
  const id = 'eab515dd-166b-417d-8221-49036c8a5dd7'
  const message = { id, body: 'Observed on reload.', replies: [] }
  const fetch = vi.fn(async (url, init) => {
    if (init.method === 'GET') return Response.json({ messages: [message] })
    return Response.json({ message, recipientInactive: JSON.parse(init.body).kind === 'question' })
  })
  let service
  try {
    await writeFile(sessionFile, JSON.stringify({ developer: 'a'.repeat(64) }), { mode: 0o600 })
    service = await createFrontendTools({ dataDir: workspace, sessionFile, apiBase: 'https://board.test/api', allowApiWrites: true },
      { validateConfiguration: value => value, createRuntimeCatalogue: () => [] }, { fetch })
    const about = { topic: 'site', key: 'worker', text: 'Check the saved version.' }
    expect((await service.call('board_post', { kind: 'question', ...about, to: 'bo' })).recipientInactive).toBe(true)
    await service.call('board_post', { kind: 'wanted', ...about, parentIssue: 1619 })
    expect(JSON.parse(fetch.mock.lastCall[1].body).parentIssue).toBe(1619)
    await service.call('board_take', { id })
    expect(fetch.mock.lastCall[0]).toContain('/' + id + '/take')
    await service.call('board_messages', { parentIssue: 1619 })
    expect(fetch.mock.lastCall[0]).toContain('parentIssue=1619')
    const result = await service.call('board_reply', { id, text: about.text, outcome: 'different-result', evidence: 42 })
    expect(JSON.parse(fetch.mock.lastCall[1].body)).toEqual({ body: about.text, outcome: 'different-result', evidence: 42 })
    expect(result.message.untrusted_text).toBe(message.body)
  } finally {
    await service?.close()
    await rm(workspace, { recursive: true, force: true })
  }
})

it('returns expiring claims to the developer MCP and accepts an older inbox response', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'modwerk-board-inbox-'))
  const sessionFile = join(workspace, 'credentials.json')
  const developer = 'a'.repeat(64)
  const inbox = { login: 'ada', waiting: [], replies: [] }
  const claim = { id: 'test', kind: 'issue', key: '1620', expiresAt: '2026-11-20T10:00:00.000Z' }
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json({ ...inbox, expiring: [{ ...claim, note: 'Still working' }] }))
    .mockResolvedValueOnce(Response.json(inbox))
  let service
  try {
    await writeFile(sessionFile, JSON.stringify({ developer }), { mode: 0o600 })
    const frontend = { validateConfiguration: value => value, createRuntimeCatalogue: () => [] }
    service = await createFrontendTools({ dataDir: workspace, sessionFile, apiBase: 'https://board.test/api' }, frontend, { fetch })
    expect(await service.call('board_inbox')).toEqual({ ...inbox, expiring: [{ ...claim, untrusted_note: 'Still working' }] })
    expect(await service.call('board_inbox')).toEqual({ ...inbox, expiring: [] })
    expect(fetch).toHaveBeenCalledWith('https://board.test/api/agent-board/inbox', expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ 'X-Modwerk-Developer': developer }) }))
  } finally {
    await service?.close()
    await rm(workspace, { recursive: true, force: true })
  }
})

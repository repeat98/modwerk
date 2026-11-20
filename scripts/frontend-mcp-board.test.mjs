import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { createFrontendTools } from './frontend-mcp.mjs'

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

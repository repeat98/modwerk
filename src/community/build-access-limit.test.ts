import { afterEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { AVAILABLE_MODULES } from '../catalog/availability'
import { SET_MODULE_LIMIT } from '../catalog/set-limit'
import { USB_AUDIO_MODULE } from '../config/usb-audio'
import { testServer } from './test-server'

const databases: DatabaseSync[] = []
afterEach(() => { for (const db of databases.splice(0)) db.close() })
const ids = AVAILABLE_MODULES.map(module => module.id).filter(id => id !== USB_AUDIO_MODULE)

describe('the Worker’s build check', () => {
  it('refuses a card build over the module limit with its count, and takes it once trimmed', async () => {
    const server = await testServer(); databases.push(server.db)
    const access = (moduleIds: string[]) => server.call('/auth/build-access', 'POST', { moduleIds })
    const over = await access(ids.slice(0, SET_MODULE_LIMIT + 1))
    expect(over.status).toBe(403)
    expect(JSON.stringify(await over.json())).toContain(`This set has ${SET_MODULE_LIMIT + 1} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove 1 to build.`)
    expect((await access([...ids.slice(0, SET_MODULE_LIMIT), USB_AUDIO_MODULE])).status).toBe(200)
  })
})

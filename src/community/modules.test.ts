import { describe, expect, it } from 'vitest'
import { maintainedModules, developerApi } from '../../server/developers'
import { moduleDevelopers } from '../../server/bug-reports'
import { testDatabase } from './test-server'
import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { MODULES } from '../catalog/modules'
import { COMMUNITY_MODULES, communityModule, developerModules } from './modules'

describe('reviewed maintainer opt-outs', () => {
  it('denies existing claims, new claims and developer notification delivery after an opt-out', async () => {
    const { db, adapter } = testDatabase()
    const user = { id: 'former-maintainer', display_name: 'Sam Banks', github_id: '1234', github_login: 'SamBanks' }
    try {
      db.prepare('INSERT INTO users(id,display_name,github_id,github_login) VALUES(?,?,?,?)').run(user.id, user.display_name, user.github_id, user.github_login)
      for (const id of ['cc-map', 'recorder-loop-fix']) {
        db.prepare('INSERT INTO module_maintainers(module_id,user_id,github_login) VALUES(?,?,?)').run(id, user.id, user.github_login)
        const { recipients, values } = moduleDevelopers(communityModule(id)!, '')
        expect(db.prepare(recipients).all(...values)).toEqual([])
        await expect(developerApi(new Request('https://api.example.test/api/developer/modules/' + id + '/claim', { method: 'POST' }), adapter, null, false, user)).rejects.toMatchObject({ status: 401 })
      }
      expect(await maintainedModules(adapter, user)).toEqual([])
    } finally { db.close() }
  })

  it('preserves Sam Banks’s authorship and credits while removing maintenance responsibility', () => {
    for (const id of ['cc-map', 'recorder-loop-fix']) {
      expect(communityModule(id)).toMatchObject({ author: 'sambanks', maintainers: [] })
      expect(MODULES.find(module => module.id === id)).toMatchObject({ author: 'sambanks', authorName: 'Sam Banks', authorUrl: 'https://github.com/sambanks' })
      expect(MODULE_DOCUMENTS_BY_ID[id].author.credits.some(credit => credit.includes('Sam Banks'))).toBe(true)
    }
  })

  it('prevents all opted-out claims, including older modules and differently cased logins', () => {
    expect(developerModules('sambanks')).toEqual([])
    expect(developerModules('SamBanks')).toEqual([])
    expect(COMMUNITY_MODULES.some(module => module.maintainers.some(login => login.toLowerCase() === 'sambanks'))).toBe(false)
    expect(communityModule('miniverb')?.maintainers).toEqual(['repeat98'])
    expect(communityModule('digitakt-digihealth')?.maintainers).toEqual(['irpina'])
  })
})

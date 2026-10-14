import type { Plugin } from 'vite'
import { COMMUNITY_MODULES } from '../src/community/modules'
import { isModulePaused, isBetaModule } from '../src/catalog/availability'
import { moduleChangelogs } from '../src/community/module-changelogs'
import type { ModuleReleaseManifest } from '../src/community/module-release-contract'
import { readFirmwareBuildManifest } from './firmware-build-manifest.mjs'
import { fileURLToPath } from 'node:url'

export function moduleReleases(): Plugin {
  return {
    name: 'modwerk-module-release-inventory', apply: 'build',
    async generateBundle() {
      const manifest: ModuleReleaseManifest = { format: 'modwerk-module-releases-v1', modules: COMMUNITY_MODULES.filter(module => module.machine !== 'octatrack' || !isModulePaused(module.id) || isBetaModule(module.id)).map(({ id, name, version, href }) => {
        const notes = moduleChangelogs[id]?.find(entry => entry.version === version)
        if (!notes) throw new Error('Missing release notes for ' + id + ' v' + version + '. Add them to src/community/module-changelogs/' + id + '.json.')
        return { id, name, version, href, notes, ...(isBetaModule(id) ? { beta: true } : {}) }
      }) }
      this.emitFile({ type: 'asset', fileName: 'module-releases.json', source: JSON.stringify(manifest) })
      this.emitFile({ type: 'asset', fileName: 'firmware-builder.json', source: JSON.stringify(await readFirmwareBuildManifest(fileURLToPath(new URL('../', import.meta.url)))) })
    },
  }
}

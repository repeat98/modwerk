// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
import { compareModuleVersions } from '../catalog/versions'
import { parseReleaseNotes, type ReleaseNotes } from './module-release-notes'

// Older sites have no notes; they remain readable during deployment, but cannot queue new releases.
export type ModuleRelease = { id: string; name: string; version: string; href: string; notes?: ReleaseNotes; beta?: boolean }
export type ModuleReleaseManifest = { format: 'modwerk-module-releases-v1'; modules: ModuleRelease[] }
export type ModuleUpdateSubscription = { enabled: boolean; emailEnabled: boolean; emailAvailable: boolean; version: string | null }

/** Only the version inventory published with the site can announce an available update. */
export function parseModuleReleases(value: unknown): ModuleRelease[] {
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'modwerk-module-releases-v1' || !('modules' in value) || !Array.isArray(value.modules) || value.modules.length > 500) throw new Error('Invalid module release inventory.')
  const ids = new Set<string>()
  return value.modules.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid module release.')
    const { id, name, version, href, notes, beta } = item as Partial<ModuleRelease>
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(id) || ids.has(id) || typeof name !== 'string' || !name.trim() || name.length > 120 || typeof version !== 'string' || version.length > 80 || typeof href !== 'string' || !/^#(?:module\/[a-z0-9-]+|(?:digitakt|digitone)\/module\/[a-z0-9-]+)$/.test(href)) throw new Error('Invalid module release.')
    if (beta !== undefined && typeof beta !== 'boolean') throw new Error('Invalid beta release flag.')
    compareModuleVersions(version, version)
    const releaseNotes = notes === undefined ? undefined : parseReleaseNotes(notes, id)
    if (releaseNotes && releaseNotes.version !== version) throw new Error('Release notes must match the published version for ' + id + '.')
    ids.add(id)
    return { id, name, version, href, ...(releaseNotes ? { notes: releaseNotes } : {}), ...(beta === undefined ? {} : { beta }) }
  })
}

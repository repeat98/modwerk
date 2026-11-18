import { baseVersion } from '../engine/elekloader/base-variants.ts'

/** The base's file name carries its version, as the site and the unit's status page name it, then the first eight hex
 * digits of its identity, which tell one version's USB Audio layouts apart: Modwerk-octatrack-base-0.7-dfb632b0.bin.
 * A base without a version has the digits alone. */
export function firmwareFilename(configurationName: string, identity: string): string {
  const name = configurationName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '') || 'configuration'
  const version = baseVersion(identity.toLowerCase())
  return `Modwerk-octatrack-${name}-${version ? version + '-' : ''}${identity.slice(0, 8).toLowerCase()}.bin`
}

export function saveFirmware(buffer: ArrayBuffer, configurationName: string, identity: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' })), link = document.createElement('a')
  link.href = url; link.download = firmwareFilename(configurationName, identity)
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

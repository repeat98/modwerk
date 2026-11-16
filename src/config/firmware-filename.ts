/** The base's file name ends in the first eight hex digits of its identity, as the site names the base everywhere else
 * (the module file dialog, the update prompt): one number for one base, not the image's hash beside the base's. */
export function firmwareFilename(configurationName: string, identity: string): string {
  const name = configurationName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '') || 'configuration'
  return `Modwerk-octatrack-${name}-${identity.slice(0, 8).toLowerCase()}.bin`
}

export function saveFirmware(buffer: ArrayBuffer, configurationName: string, identity: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' })), link = document.createElement('a')
  link.href = url; link.download = firmwareFilename(configurationName, identity)
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function firmwareFilename(configurationName: string, sha256: string): string {
  const name = configurationName
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '') || 'configuration'
  return `Modwerk-octatrack-${name}-${sha256.slice(0, 6).toLowerCase()}.bin`
}

export function saveFirmware(buffer: ArrayBuffer, configurationName: string, sha256: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/octet-stream' })), link = document.createElement('a')
  link.href = url; link.download = firmwareFilename(configurationName, sha256)
  document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

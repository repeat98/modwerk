// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
import currentBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import currentPackages from '../assets/octatrack-module-packages.json' with { type: 'json' }
import linkedBinding from '../assets/linked-audio-0.7.11/base-binding.json' with { type: 'json' }
import linkedPackages from '../assets/linked-audio-0.7.11/linked-base-packages.json' with { type: 'json' }
import { USB_AUDIO_PACKAGED } from '../../config/usb-audio.ts'

export const publishedBinding = USB_AUDIO_PACKAGED ? currentBinding : linkedBinding
const linkedById = new Map(linkedPackages.map(entry => [entry.id, entry]))
export const publishedPackages = {
  ...currentPackages,
  packages: currentPackages.packages.map(current => {
    const linked = linkedById.get(current.id)
    const entry = !USB_AUDIO_PACKAGED && linked ? linked : current
    if (linked && linked.path === current.path && linked.sha256 !== current.sha256) {
      return { ...entry, path: 'octatrack-base-packages/' + entry.sha256 + '.mwrm' }
    }
    return entry
  }),
}

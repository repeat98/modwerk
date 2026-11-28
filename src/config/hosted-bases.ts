// Hosted base images (docs/HOSTED_BASES.md): a Modwerk base without the musician's own OS file. An image counts
// only when its identity is the one this site publishes for the layout and its bytes match the manifest's SHA-256;
// the unit's IDENTIFY then confirms the identity once it runs.
import type { HostedBase, HostedBaseManifest } from '../../server/base-images'
import { api, apiFetch } from '../community/api'
import { baseLayout, buildLayout, type BaseLayout } from '../engine/elekloader/base-variants'
import { STEP_IDENTITIES } from '../engine/elekloader/base-step'
import type { BaseImage } from '../components/BaseInstallDialog'

let manifest: Promise<HostedBase[]> | undefined
/** The hosted images, read once per page; none when the service is unreachable. */
export const hostedBases = () => manifest ??= api<HostedBaseManifest>('/bases').then(value => Array.isArray(value?.images) ? value.images : [], () => [])

/** The hosted Octatrack image the site would build for this layout, if one is hosted. */
export function hostedOctatrackEntry(images: readonly HostedBase[], layout?: BaseLayout, step = false) {
  const wanted = buildLayout(layout, step)
  return images.find(image => image.machine === 'octatrack' && !!image.step === step && image.layout === wanted &&
    image.identity === (step ? STEP_IDENTITIES[wanted] : baseLayout(image.identity) === wanted ? image.identity : undefined))
}

/** A hosted image's bytes, refused unless their size and SHA-256 are the manifest's. `own` names the musician's file. */
export async function downloadHostedBase(entry: HostedBase, own: string) {
  const response = await apiFetch('/bases/' + entry.machine + '/' + entry.identity)
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Sign in with a verified account to download the prebuilt base.' : 'The prebuilt base did not download. Try again, or choose your own ' + own + '.')
  const buffer = await response.arrayBuffer()
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (buffer.byteLength !== entry.size || sha256 !== entry.sha256) throw new Error('The prebuilt base arrived damaged. Try again, or choose your own ' + own + '.')
  return { buffer, sha256 }
}

export async function hostedOctatrackBase(layout?: BaseLayout, step = false): Promise<BaseImage> {
  const entry = hostedOctatrackEntry(await hostedBases(), layout, step)
  if (!entry) throw new Error('Modwerk has no prebuilt base for this yet. Choose your own OS 1.40C file instead.')
  return { ...await downloadHostedBase(entry, 'OS 1.40C file'), base: entry.identity }
}


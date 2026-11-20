import { sha } from '../../../vendor/elekloader/kit/src/bytes'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import baseBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import published from '../assets/octatrack-base-variants.json' with { type: 'json' }
import manifest from '../assets/octatrack-module-packages.json' with { type: 'json' }
import { USB_AUDIO_LAYOUTS, USB_AUDIO_MODULE, type UsbAudioLayout } from '../../config/usb-audio'
import { applyVariantPatch, baseLayout, DEFAULT_LAYOUT, isPublishedBase, layoutIdentity, variantPackage, type BaseLayout, type BaseVariants } from './base-variants'
import { BaseLayoutRequired, BaseUpdateRequired, createRuntimeCatalogue, USB_MODULE_IDS } from './module-set'

const variants = published as BaseVariants
const defaultText = readFileSync(new URL('../assets/octatrack-base.elemod', import.meta.url), 'utf8')
const configurable = Boolean((manifest as { usbAudio?: { configurable?: unknown } }).usbAudio?.configurable)
const layouts: BaseLayout[] = configurable ? ['off'] : [...USB_AUDIO_LAYOUTS.map(layout => layout.id), 'off']
const identities = (baseBinding as unknown as { variants: Record<BaseLayout, string> }).variants

describe('the base in each USB Audio layout', () => {
  it('publishes exactly the base identities required by the USB Audio installation format', () => {
    expect(Object.keys(identities).sort()).toEqual([...layouts].sort())
    expect(new Set(Object.values(identities)).size).toBe(layouts.length)
    expect(identities[DEFAULT_LAYOUT]).toBe(baseBinding.identity)
    for (const layout of layouts) {
      expect(layoutIdentity(layout)).toBe(identities[layout])
      expect(baseLayout(identities[layout])).toBe(layout)
      expect(isPublishedBase(identities[layout])).toBe(true)
    }
    expect(isPublishedBase('0'.repeat(64))).toBe(false)
    expect(baseLayout(undefined)).toBeUndefined()
  })

  it('rebuilds each variant package exactly from the committed default package', () => {
    expect(variants.variants.map(variant => variant.layout).sort()).toEqual(layouts.filter(layout => layout !== DEFAULT_LAYOUT).sort())
    expect(variantPackage(defaultText, variants, DEFAULT_LAYOUT)).toBeUndefined()
    for (const variant of variants.variants) {
      const built = variantPackage(defaultText, variants, variant.layout)!
      expect(variant.identity).toBe(identities[variant.layout])
      expect(built.fills).toBe(variant.fills)
      // Only the USB block, its sites and the identity differ: the rest of the package is shared.
      expect(JSON.parse(built.text).id).toBe('core')
    }
  })

  it('refuses a damaged patch, a foreign default package or an unpublished layout', () => {
    // Exercise patch validation even when the current release needs a single base.
    const digest = (text: string) => sha(new TextEncoder().encode(text))
    const original = 'a\nb\nc', changed = 'A\nb\nC'
    const variant = { layout: 'tracks' as const, identity: 'a'.repeat(64), packageSha256: digest(changed),
      patch: [[0, 1, ['A']], [2, 1, ['C']]] as BaseVariants['variants'][number]['patch'], fills: [] }
    const fixture = { schema: 1 as const, packageSha256: digest(original), variants: [variant] }
    const base = { defaultLayout: 'off' as const, identity: () => variant.identity }
    expect(variantPackage(original, fixture, variant.layout, base)?.text).toBe(changed)
    expect(() => applyVariantPatch(original, [[0, 1, ['not the package']], ...variant.patch], variant.packageSha256)).toThrow('damaged')
    expect(() => applyVariantPatch(original, [...variant.patch].reverse(), variant.packageSha256)).toThrow('damaged')
    expect(() => variantPackage(original + ' ', fixture, variant.layout, base)).toThrow('don’t match')
    expect(() => variantPackage(original, { ...fixture, variants: [] }, variant.layout, base)).toThrow('isn’t published')
  })
})

describe('USB Audio in a module set', () => {
  const catalogue = createRuntimeCatalogue(manifest)
  const empty = { moduleIds: [], removedStockFx: [] }, capable = { abi: 8, features: 0xffff, maxSites: 128, maxCopies: 128 }
  const set = (layout?: UsbAudioLayout) => ({ name: 'Audio', moduleIds: [USB_AUDIO_MODULE], ...(layout ? { usbAudio: { layout } } : {}) })

  it('is selectable over USB because the base provides it', () => expect(USB_MODULE_IDS).toContain(USB_AUDIO_MODULE))

  it('installs the set on the published base for its USB Audio format', () => {
    if (configurable) {
      for (const layout of USB_AUDIO_LAYOUTS) {
        const review = catalogue.review(set(layout.id), empty, capable, identities.off)
        expect(review).toMatchObject({ needsSync: true, changes: { add: [USB_AUDIO_MODULE] }, problem: undefined })
      }
      return
    }
    const review = catalogue.review(set('tracks-post'), empty, undefined, identities['tracks-post'])
    expect(review).toMatchObject({ needsSync: false, problem: undefined })
    expect(review.changes.add).toEqual([])
    // Without a layout setting, the set asks for the card module's classic twenty channels.
    expect(catalogue.review(set(), empty, undefined, identities['tracks-main-cue']).problem).toBeUndefined()
  })

  it('requires the right base before fetching any USB Audio package', async () => {
    if (configurable) {
      const old = 'b'.repeat(64)
      expect(catalogue.review(set('tracks-post'), empty, capable, old).problem).toBeInstanceOf(BaseUpdateRequired)
      await expect(catalogue.prepare(set('main'), empty, () => Promise.reject(new Error('fetched')), capable, old)).rejects.toBeInstanceOf(BaseUpdateRequired)
      return
    }
    for (const running of ['off', 'tracks-main-cue', 'main'] as BaseLayout[]) {
      const review = catalogue.review(set('tracks-post'), empty, undefined, identities[running])
      expect(review.needsSync).toBe(true)
      expect(review.problem).toBeInstanceOf(BaseLayoutRequired)
      expect(review.problem).toBeInstanceOf(BaseUpdateRequired)
      expect((review.problem as BaseLayoutRequired).layout).toBe('tracks-post')
    }
    await expect(catalogue.prepare(set('main'), empty, () => Promise.reject(new Error('fetched')), undefined, identities['tracks-main-cue'])).rejects.toBeInstanceOf(BaseLayoutRequired)
  })

  it('leaves the base alone when the set has no USB Audio, and takes the bound packages on every layout', () => {
    const bound = manifest.packages.find(entry => 'requiredBase' in entry)!
    for (const layout of layouts) {
      expect(catalogue.review({ name: 'No audio', moduleIds: [] }, empty, capable, identities[layout]).problem).toBeUndefined()
      expect(catalogue.review({ name: 'Bound', moduleIds: [bound.id] }, empty, capable, identities[layout]).problem).toBeUndefined()
    }
    expect(catalogue.review({ name: 'Bound', moduleIds: [bound.id] }, empty, capable, 'b'.repeat(64)).problem).toBeInstanceOf(BaseUpdateRequired)
  })
})

describe('a base’s version', () => {
  it('names the published base in every layout, each version once, and falls back to the identity’s start', async () => {
    const { baseName, baseVersion, CURRENT_BASE_VERSION } = await import('./base-variants')
    const versions = (await import('../../../sdk/machines/octatrack/base-versions.json', { with: { type: 'json' } })).default
    const binding = (await import('../../../sdk/machines/octatrack/base-binding.json', { with: { type: 'json' } })).default
    const number = (await import('../../../sdk/machines/octatrack/elekloader/base-version.json', { with: { type: 'json' } })).default
    const patch = 'patch' in number && number.patch ? '.' + number.patch : ''
    expect(CURRENT_BASE_VERSION).toBe(number.major + '.' + number.minor + patch) // what the base itself shows: MODWERK BASE 0.7.1
    for (const identity of [binding.identity, ...Object.values(binding.variants)]) expect(baseVersion(identity)).toBe(CURRENT_BASE_VERSION)
    expect(new Set(versions.bases.map(base => base.version)).size).toBe(versions.bases.length)
    const identities = versions.bases.flatMap(base => base.identities)
    expect(new Set(identities).size).toBe(identities.length) // one base, one version
    expect(versions.bases.every(base => /^\d{1,3}\.\d{1,3}(\.\d{1,3})?$/.test(base.version))).toBe(true)
    expect(baseName(binding.identity)).toBe(CURRENT_BASE_VERSION)
    expect(baseVersion('b'.repeat(64))).toBeUndefined()
    expect(baseName('a6b457a1' + '0'.repeat(56))).toBe('a6b457a1') // a base from before versions
    expect(baseVersion()).toBeUndefined()
  })
})

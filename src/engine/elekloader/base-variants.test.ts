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
const layouts: BaseLayout[] = [...USB_AUDIO_LAYOUTS.map(layout => layout.id), 'off']
const identities = (baseBinding as unknown as { variants: Record<BaseLayout, string> }).variants

describe('the base in each USB Audio layout', () => {
  it('publishes every layout and USB MIDI alone, each under its own identity', () => {
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
    const variant = variants.variants[0]
    expect(() => applyVariantPatch(defaultText, [[0, 1, ['not the package']], ...variant.patch], variant.packageSha256)).toThrow('damaged')
    expect(() => applyVariantPatch(defaultText, [...variant.patch].reverse(), variant.packageSha256)).toThrow('damaged')
    expect(() => variantPackage(defaultText + ' ', variants, variant.layout)).toThrow('don’t match')
    expect(() => variantPackage(defaultText, { ...variants, variants: [] }, variant.layout)).toThrow('isn’t published')
  })
})

describe('USB Audio in a module set', () => {
  const catalogue = createRuntimeCatalogue(manifest)
  const empty = { moduleIds: [], removedStockFx: [] }, capable = { abi: 8, features: 0xffff, maxSites: 128, maxCopies: 128 }
  const set = (layout?: UsbAudioLayout) => ({ name: 'Audio', moduleIds: [USB_AUDIO_MODULE], ...(layout ? { usbAudio: { layout } } : {}) })

  it('is selectable over USB because the base provides it', () => expect(USB_MODULE_IDS).toContain(USB_AUDIO_MODULE))

  it('needs nothing synced when the base runs the set’s layout', () => {
    const review = catalogue.review(set('tracks-post'), empty, undefined, identities['tracks-post'])
    expect(review).toMatchObject({ needsSync: false, problem: undefined })
    expect(review.changes.add).toEqual([])
    // Without a layout setting, the set asks for the card module's classic twenty channels.
    expect(catalogue.review(set(), empty, undefined, identities['tracks-main-cue']).problem).toBeUndefined()
  })

  it('asks for the base in the set’s layout when the unit runs another one, and sends nothing', async () => {
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

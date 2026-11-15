// SPDX-License-Identifier: GPL-3.0-or-later
// The Modwerk base comes in one variant per USB Audio layout, plus USB MIDI alone ('off'). A layout changes the USB
// descriptors, so it is a property of the base, installed over USB like any base update. Every variant links its USB
// sources last in a fixed reserve (build_core.py usb_reserve), so all of them share every other address: one set of
// base-bound packages fits each (scripts/octatrack-base.mjs --usb-audio-variants proves it when it writes them).
// The committed package is the default layout's; each other variant is a line patch against it, checked by hash.
import baseBinding from '../../../sdk/machines/octatrack/base-binding.json' with { type: 'json' }
import { sha } from '../../../vendor/elekloader/kit/src/bytes.ts'
import { USB_AUDIO_LAYOUTS, type UsbAudioLayout } from '../../config/usb-audio.ts'
import type { BaseFill } from './octatrack-base.ts'

export type BaseLayout = UsbAudioLayout | 'off'
export type VariantPatch = [line: number, removed: number, added: string[]][]
export interface BaseVariant { layout: BaseLayout; identity: string; packageSha256: string; patch: VariantPatch; fills: BaseFill[] }
export interface BaseVariants { schema: 1; packageSha256: string; variants: BaseVariant[] }

/** Each layout's base identity (what IDENTIFY reports); the default layout's is base-binding.json's identity. */
const VARIANTS: Partial<Record<BaseLayout, string>> = (baseBinding as { variants?: Partial<Record<BaseLayout, string>> }).variants ?? {}
export const DEFAULT_LAYOUT: BaseLayout = (Object.entries(VARIANTS).find(([, identity]) => identity === baseBinding.identity)?.[0] as BaseLayout | undefined) ?? 'tracks-main-cue'
/** The layout a base install or update gets when no module set asks for one (owner, 11 November 2026): USB MIDI alone.
 * A set with the USB Audio module asks for its layout (module-set.ts setLayout). DEFAULT_LAYOUT stays the committed
 * package's, which every other layout is a patch against. */
export const MEMBER_LAYOUT: BaseLayout = 'off'
const IDENTITIES = new Map<string, BaseLayout>([[baseBinding.identity, DEFAULT_LAYOUT], ...Object.entries(VARIANTS).map(([layout, identity]) => [identity, layout as BaseLayout] as const)])

/** The layout a published base runs, by its identity; undefined for an older or unknown base. */
export const baseLayout = (identity?: string) => identity === undefined ? undefined : IDENTITIES.get(identity)
/** The previous base's identities (`500cdb6f…`, published until 11 November 2026, base-binding.json's `variants` at
 * that time), for this one transition only: its default was `tracks-main-cue`, the new base's is USB Audio off, so an
 * update from it says when it turns USB Audio off. Not published any more: never a base the site syncs to. */
const PREVIOUS_IDENTITIES = new Map<string, BaseLayout>([
  ['500cdb6fd81bfc9c2b18737e7487f3ec2264c1c00c5ebef833e7f751e325d1b7', 'tracks-main-cue'],
  ['667de8d4054205ff1fd4ef34bee82cd41c1f596f7b5e6b5178240b9e4486c8da', 'tracks'],
  ['aaa1960781b1c1882e6c26bd3ca6ae7fe3816d9fec9d443b9df9852ab8786951', 'tracks-post'],
  ['0f2e768bb0a3f47ddcdcca0c520b3ee169d4c11f33630904270e911be6d850c6', 'main-cue'],
  ['504465978a9e5c03cc877527111d396962399c21d6bc45940867c7757d0ba881', 'main'],
  ['d16bd599630c2312ad50d0cfb0c4011138154bc5ea3c7f7e09f7a1353f1b8962', 'master'],
  ['05b7f09031bc3892626e7c2576810386faeb01bd3a3101353a56c56c96d82a4a', 'off'],
])
/** The layout a unit's base runs as far as the site knows: a published base's, or the previous base's; undefined for
 * any other base, which may have had USB Audio. */
export const runningLayout = (identity?: string) => identity === undefined ? undefined : IDENTITIES.get(identity) ?? PREVIOUS_IDENTITIES.get(identity)
/** Whether a base is one of the published variants: any of them takes the published packages. */
export const isPublishedBase = (identity?: string) => baseLayout(identity) !== undefined
/** The identity of the published base with this layout, when the site publishes it. */
export const layoutIdentity = (layout: BaseLayout) => layout === DEFAULT_LAYOUT ? baseBinding.identity : VARIANTS[layout]
export const layoutName = (layout: BaseLayout) => layout === 'off' ? 'USB Audio off' : 'USB Audio · ' + USB_AUDIO_LAYOUTS.find(item => item.id === layout)!.name

const textSha = (text: string) => sha(new TextEncoder().encode(text))

/** `patch` applied to `text` (hunks in order, none overlapping), refused unless the result hashes to `sha256`. */
export function applyVariantPatch(text: string, patch: VariantPatch, sha256: string): string {
  const lines = text.split('\n')
  let last = Infinity
  for (const [line, removed, added] of [...patch].reverse()) {
    if (!Number.isInteger(line) || !Number.isInteger(removed) || !Array.isArray(added) || line < 0 || removed < 0 || line + removed > Math.min(last, lines.length))
      throw new Error('The base layout patch is damaged. Reload the page.')
    lines.splice(line, removed, ...added); last = line
  }
  const result = lines.join('\n')
  if (textSha(result) !== sha256) throw new Error('The base layout patch is damaged. Reload the page.')
  return result
}

/** The variant's package text and fills from the default package, or undefined for the default layout itself. */
export function variantPackage(defaultText: string, variants: BaseVariants, layout: BaseLayout, base: { defaultLayout: BaseLayout; identity: (layout: BaseLayout) => string | undefined } = { defaultLayout: DEFAULT_LAYOUT, identity: layoutIdentity }): { text: string; fills: BaseFill[] } | undefined {
  if (layout === base.defaultLayout) return undefined
  const variant = variants.variants.find(item => item.layout === layout)
  if (variants.schema !== 1 || !variant || variant.identity !== base.identity(layout)) throw new Error('This Modwerk base layout isn’t published.')
  if (textSha(defaultText) !== variants.packageSha256) throw new Error('The base package and its layouts don’t match. Reload the page.')
  return { text: applyVariantPatch(defaultText, variant.patch, variant.packageSha256), fills: variant.fills }
}

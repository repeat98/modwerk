// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)
// How many modules one Octatrack module set may hold for now (owner, 11 November 2026: units showed DSP stalls and
// failed self-tests with 14 to 20 modules; raised to 24 on 14 November 2026, since the largest sets seen held 23).
// Every add, the USB sync, the card build and the Worker's build check read it from here. A set that already holds
// more still loads and shows; it only cannot be synced or built until trimmed.
import { MODULES } from './modules.ts'
import { USB_AUDIO_MODULE } from '../config/usb-audio.ts'
import type { AddBlock } from './add-blocks.ts'

export const SET_MODULE_LIMIT = 24

/** Only the Octatrack's sets are limited; other machines keep their own rules. */
export const limitApplies = (device = 'octatrack') => device === 'octatrack'

/** Every selected module counts, machine group members one by one. USB Audio does not: it ships as a variant of the
 * base, not as a module package. Stock effects taken out of the menus and the base itself are not in the list at all. */
export const countsTowardLimit = (id: string) => id !== USB_AUDIO_MODULE

export const limitedCount = (ids: readonly string[]) => new Set(ids.filter(countsTowardLimit)).size

export const overLimit = (ids: readonly string[], device = 'octatrack') => limitApplies(device) && limitedCount(ids) > SET_MODULE_LIMIT

/** Whether the set is full: one more module that counts would go over. */
export const atLimit = (ids: readonly string[], device = 'octatrack') => limitApplies(device) && limitedCount(ids) >= SET_MODULE_LIMIT

/** Whether `id` can be added to the set. Removing is always possible, and so is anything already in it. */
export const canAdd = (ids: readonly string[], id: string, device = 'octatrack') =>
  ids.includes(id) || !countsTowardLimit(id) || !atLimit(ids, device)

/** Why another module cannot be added: said wherever an add is unavailable, so nobody is left with a bare lock. */
export const LIMIT_REACHED = `Your set is full. ${SET_MODULE_LIMIT} modules per set is a temporary limit while larger sets are made stable on every Octatrack. Remove one to add another.`

/** Why a set over the limit cannot be synced or built, with its count; '' within the limit. */
export function overLimitMessage(ids: readonly string[], action: 'sync' | 'build', device = 'octatrack') {
  if (!overLimit(ids, device)) return ''
  const count = limitedCount(ids)
  return `This set has ${count} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove ${count - SET_MODULE_LIMIT} to ${action}.`
}

/** Why several modules can't be added together, which is all or none: '' when they fit. */
export function addAllMessage(ids: readonly string[], adding: readonly string[], device = 'octatrack') {
  const count = limitedCount([...ids, ...adding])
  if (!limitApplies(device) || count <= SET_MODULE_LIMIT) return ''
  return `Adding ${adding.length === 1 ? 'it' : 'them'} would make ${count} modules; ${SET_MODULE_LIMIT} is the limit for now. Remove ${count - SET_MODULE_LIMIT} first.`
}

/** The library's note for a module that would go over the limit: its add button is unavailable, with the reason. */
export function limitBlock(id: string): AddBlock {
  return { kind: 'limit', withIds: [], reason: `Set full: ${SET_MODULE_LIMIT} modules for now`, detail: LIMIT_REACHED, key: 'limit:' + id }
}

/** The library's add notes with the limit on top: once the set is full, every module not in it gets the limit's. */
export function withSetLimit<T extends { blocks: Record<string, AddBlock> }>(compatibility: T, ids: readonly string[]): T {
  if (!atLimit(ids)) return compatibility
  const blocks = { ...compatibility.blocks }
  for (const module of MODULES) if (!canAdd(ids, module.id)) blocks[module.id] = limitBlock(module.id)
  return { ...compatibility, blocks }
}

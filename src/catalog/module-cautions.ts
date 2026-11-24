// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

import { MODULE_DOCUMENTS } from './documents'
import type { ModuleDocument } from './module-contract'
import { measuredActiveCpu, measuredFrameCost, measuredStackedCpuLimit } from './octatrack-resource-measurements'

const HIGH = { tier: 'high', badge: 'High CPU' } as const
const HEAVY = { tier: 'heavy', badge: 'Heavy CPU' } as const

export type ModuleCaution = (typeof HIGH | typeof HEAVY) & { detail: string }

export function classifyCpuCaution(document: ModuleDocument): ModuleCaution | undefined {
  const active = measuredActiveCpu(document)
  const stacked = measuredStackedCpuLimit(document)
  const price = document.resources.cpuPrice
  const curve = measuredFrameCost(document)
  const frameShare = Math.max(active?.delta ?? 0, price?.value ?? 0, curve?.first ?? 0)
  if (frameShare < 10 && !stacked) return

  const reading = active && active.delta === frameShare
    ? frameShare + ' percentage points of audio-frame load added with ' + active.workload + '.'
    : curve && curve.first === frameShare
      ? frameShare + ' percentage points of audio-frame load for the first copy and ' + curve.each + ' for each further one in the hardware instance test.'
      : price?.measure === 'machine-render'
      ? 'The release budgets ' + frameShare + '% of an audio frame per playing track.'
      : price && frameShare + ' percentage points of audio-frame load in the hardware price test.'
  const detail = [reading, stacked?.detail].filter(Boolean).join(' ')
  return { ...(frameShare >= 30 ? HEAVY : HIGH), detail }
}

/** Use the published version's CPU evidence for both the card and detail page. */
export const MODULE_CAUTIONS: Readonly<Record<string, ModuleCaution>> = Object.fromEntries(MODULE_DOCUMENTS.flatMap(document => {
  const caution = classifyCpuCaution(document)
  return caution ? [[document.id, caution] as const] : []
}))

export const moduleCaution = (id: string): ModuleCaution | undefined => MODULE_CAUTIONS[id]

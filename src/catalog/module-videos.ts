// SPDX-License-Identifier: GPL-3.0-or-later OR Elastic-2.0
// Copyright (c) 2026 Jannik Aßfalg (repeat98)

/** A YouTube video shown on a module's page. The site keeps the list rather than the module's manifest, so adding a video never rebuilds a package. */
export type ModuleVideo = {
  /** The 11-character YouTube video ID. */
  youtube: string
  /** The video's own title on YouTube. */
  title: string
  /** The channel that published it. */
  channel: string
  /** A screen capture from the module's media, drawn on the play card. */
  screen?: string
}

export const MODULE_VIDEOS: Readonly<Record<string, ModuleVideo>> = {
  grain: { youtube: 'hxvbwbY6qoE', title: 'Grain – A New Granular Engine for Elektron Octatrack', channel: 'A Force Truly Evil', screen: 'media/grain-full-screen.png' },
}

export const MODULE_VIDEO_SECTION = 'module-video'

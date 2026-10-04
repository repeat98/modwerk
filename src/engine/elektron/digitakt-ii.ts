// SPDX-License-Identifier: GPL-3.0-or-later
// Read-only Digitakt II identity and seal validation. The frozen TypeScript writer is not used for this machine.
// Facts: toonst/elekloader, PR #38 at 71a5156781838fb5ef1c3e963b3949b781043a0d (GPL-2.0-or-later).
import { sectionImage, type Ele3Device, type Ele3File } from './ele3'

export const DIGITAKT_II_IDENTITY = {
  machine: 'digitakt-ii' as const, name: 'Digitakt II',
  releases: [{ version: '1.17', syxSha256: '26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5', mainSha256: 'a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964', mainLength: 3275616 }],
}
export const DIGITAKT_II_READER: Ele3Device = { mainSection: 3, mainLoad: 0x40000400, stage: 0x40400000, flashAt: 0x80000, flashLimit: 0x380000, sysexId: 0x14 }
const seed = new TextEncoder().encode('Master Overdrive'), DIGEST = 32

/** Derive a transient key from the owner's bootstrap and verify the container. No key is returned or persisted. */
export async function verifyDigitaktIiSeal(file: Ele3File): Promise<void> {
  const stored = file.stored.get(2)
  if (file.deviceId !== 0x14 || !stored) throw new Error('The Digitakt II bootstrap is missing.')
  const end = file.table.reduce((end, section) => Math.max(end, section.offset + section.length), 0)
  if (file.total !== end + (-end & 15) + DIGEST) throw new Error('The Digitakt II seal is missing or misplaced.')
  const bootstrap = sectionImage(stored), matches: number[] = []
  for (let at = 0; at + seed.length < bootstrap.length; at++) {
    if (bootstrap[at + seed.length] === 0 && seed.every((byte, index) => bootstrap[at + index] === byte)) matches.push(at)
  }
  if (matches.length !== 1) throw new Error('The Digitakt II seal seed must occur exactly once.')
  const at = matches[0] + seed.length + 1
  if (at + DIGEST > bootstrap.length) throw new Error('The Digitakt II bootstrap seal constant is incomplete.')
  const first = new Uint8Array(await crypto.subtle.digest('SHA-256', seed))
  const last = new Uint8Array(await crypto.subtle.digest('SHA-256', seed.slice().reverse()))
  const keyBytes = Uint8Array.from(first, (byte, index) => byte ^ last[index] ^ bootstrap[at + index])
  try {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    if (!await crypto.subtle.verify('HMAC', key, file.container.slice(-DIGEST), file.container.slice(0, -DIGEST))) throw new Error('The Digitakt II firmware seal failed verification.')
  } finally { keyBytes.fill(0) }
}

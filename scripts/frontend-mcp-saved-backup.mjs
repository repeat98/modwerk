// SPDX-License-Identifier: GPL-3.0-or-later
import { mkdtemp, lstat, readFile, open, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const capacity = 2097152 + 4096 // modset.c SET_BYTES: the module pool (build_core.py RUNTIME_POOL_BYTES) and the header
const zero = '0'.repeat(64)
const hash = data => createHash('sha256').update(data).digest('hex')
const writePrivate = async (path, data) => {
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(data); await file.sync() } finally { await file.close() }
}
const privateDirectory = async path => {
  const info = await lstat(path)
  if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077) throw new Error('Saved-file backups require a private regular directory (0700).')
  return info
}

/** Accept only authenticated bounded snapshots. Neither raw bytes nor paths are tool arguments. */
export async function saveSavedBackup(dataDir, binding, snapshots, workspace) {
  if (!binding || !/^[a-f0-9]{64}$/.test(binding.base) || !/^[a-f0-9]{64}$/.test(binding.active) ||
      !Array.isArray(snapshots) || snapshots.length !== 2) throw new Error('Invalid saved-file backup binding.')
  for (const [slot, snapshot] of snapshots.entries()) {
    if (!snapshot || snapshot.slot !== slot || !Number.isInteger(snapshot.token) || snapshot.token < 1 || snapshot.token > 65535) throw new Error('Invalid saved-file snapshot ownership.')
    if (snapshot.status === 'ready') {
      if (!(snapshot.data instanceof Uint8Array) || !snapshot.length || snapshot.length !== snapshot.data.length || snapshot.length > capacity ||
          !/^[a-f0-9]{64}$/.test(snapshot.sha256) || hash(snapshot.data) !== snapshot.sha256) throw new Error('The saved-file backup failed its complete-file hash or size check.')
      const fileBase = snapshot.length >= 52 && new DataView(snapshot.data.buffer, snapshot.data.byteOffset, snapshot.data.byteLength).getUint32(0) === 0x4d575354
        ? Buffer.from(snapshot.data.subarray(20, 52)).toString('hex') : zero
      if (snapshot.fileBase !== fileBase) throw new Error('The saved-file backup header identity differs from its snapshot.')
    } else if (!['unsafe', 'read-failed', 'invalid'].includes(snapshot.status) || snapshot.length !== 0 || snapshot.sha256 !== zero || snapshot.fileBase !== zero || snapshot.data !== undefined)
      throw new Error('An unreadable saved file is not an empty or absent file.')
  }
  const root = await privateDirectory(dataDir)
  if (!workspace || root.dev !== workspace.dev || root.ino !== workspace.ino) throw new Error('The startup-selected private backup workspace changed.')
  const directory = await mkdtemp(join(dataDir, 'saved-sets-'))
  const owned = await privateDirectory(directory)
  const unchanged = async () => {
    const currentRoot = await privateDirectory(dataDir), current = await privateDirectory(directory)
    if (currentRoot.dev !== root.dev || currentRoot.ino !== root.ino || current.dev !== owned.dev || current.ino !== owned.ino) throw new Error('The private backup directory changed.')
  }
  try {
    const files = []
    for (const snapshot of snapshots) {
      const name = `MODWERK${snapshot.slot}.SET`
      if (snapshot.status !== 'ready') { files.push({ slot: snapshot.slot, name, status: snapshot.status, absent: false }); continue }
      await unchanged()
      const path = join(directory, name)
      await writePrivate(path, snapshot.data)
      const info = await lstat(path)
      if (!info.isFile() || info.isSymbolicLink() || info.mode & 0o077 || info.size !== snapshot.length || hash(await readFile(path)) !== snapshot.sha256)
        throw new Error('The saved private file differs from its verified snapshot.')
      files.push({ slot: snapshot.slot, name, status: 'ready', path, bytes: snapshot.length, sha256: snapshot.sha256, fileBase: snapshot.fileBase })
    }
    const receipt = { schemaVersion: 1, supported: true, complete: files.every(file => file.status === 'ready'), recoveryVerified: false,
      base: binding.base, active: binding.active, cardWrites: false, directory, files }
    await unchanged()
    await writePrivate(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n')
    await unchanged()
    return receipt
  } catch (error) {
    // Never delete a replacement directory or follow an unexpected symlink.
    const current = await lstat(directory).catch(() => undefined)
    if (current?.isDirectory() && !current.isSymbolicLink() && current.dev === owned.dev && current.ino === owned.ino)
      await rm(directory, { recursive: true, force: true })
    throw error
  }
}

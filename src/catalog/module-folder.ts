import path from 'node:path'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { modulePath } from './module-contract.ts'

/** True when `realPath` is outside `folder` (including symlink escapes). */
export function escapesModuleFolder(folder: string, realPath: string, paths = path): boolean {
  const rel = paths.relative(folder, realPath)
  return paths.isAbsolute(rel) || rel === '..' || rel.startsWith('..' + paths.sep)
}

/**
 * Require every part of `filePath` to match a name on disk letter for letter. Windows and macOS open `retrig.s` for
 * `retrig.S`; Linux, where CI and the release build run, does not, so a path that only works there is rejected everywhere.
 */
async function requireExactCase(folder: string, filePath: string): Promise<void> {
  let directory = folder
  for (const part of filePath.split('/')) {
    const names = await readdir(directory)
    if (!names.includes(part)) {
      const actual = names.find(name => name.toLowerCase() === part.toLowerCase())
      if (actual) throw new Error(filePath + ': the file on disk is named ' + actual + '. Write the path with exactly that case; Linux CI and the release build are case-sensitive')
      return // Truly absent: lstat reports it with ENOENT, which callers use to treat optional files as missing.
    }
    directory = path.join(directory, part)
  }
}

/** Validate the same file boundary used by module generation and media copying. */
export async function resolveModuleFile(folder: string, filePath: string): Promise<string> {
  modulePath(filePath)
  await requireExactCase(folder, filePath)
  const target = path.resolve(folder, filePath)
  const info = await lstat(target)
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(filePath + ': expected a regular file')
  if (escapesModuleFolder(await realpath(folder), await realpath(target))) throw new Error(filePath + ': escapes module folder')
  return target
}

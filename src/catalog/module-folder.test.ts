import { describe, expect, it } from 'vitest'
import path, { posix, win32 } from 'node:path'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { escapesModuleFolder, resolveModuleFile } from './module-folder'

describe.each([
  { name: 'POSIX', paths: posix, folder: '/repo/sdk/octabam/modules/midi-scenes' },
  { name: 'Windows', paths: win32, folder: 'C:\\repo\\sdk\\octabam\\modules\\midi-scenes' },
])('$name module folder containment', ({ paths, folder }) => {
  it('accepts nested files and names beginning with two dots', () => {
    for (const parts of [['README.md'], ['upstream', 'gas', 'msc.s'], ['..notes.md'], ['docs', '..legacy.txt']]) {
      expect(escapesModuleFolder(folder, paths.resolve(folder, ...parts), paths)).toBe(false)
    }
    expect(escapesModuleFolder(folder, folder, paths)).toBe(false)
  })

  it('rejects parent, sibling and similarly prefixed folder escapes', () => {
    for (const target of [paths.dirname(folder), paths.resolve(folder, '..', 'other', 'x.md'), folder + '-other' + paths.sep + 'x.md']) {
      expect(escapesModuleFolder(folder, target, paths)).toBe(true)
    }
  })
})

it('rejects Windows drive and UNC share changes on every host', () => {
  expect(escapesModuleFolder('C:\\repo\\module', 'D:\\outside\\x.md', win32)).toBe(true)
  expect(escapesModuleFolder('\\\\server\\share\\module', '\\\\server\\other-share\\x.md', win32)).toBe(true)
  expect(escapesModuleFolder('C:\\repo\\module', 'c:\\repo\\module\\README.md', win32)).toBe(false)
})

it('validates real files and rejects traversal, file symlinks and directory symlink escapes', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'octamod-folder-'))
  const folder = path.join(temporary, 'module'), outside = path.join(temporary, 'module-other')
  try {
    await mkdir(path.join(folder, 'docs'), { recursive: true })
    await mkdir(outside)
    await writeFile(path.join(folder, '..notes.md'), 'Module notes')
    await writeFile(path.join(folder, 'docs', '..legacy.txt'), 'Nested notes')
    await writeFile(path.join(outside, 'README.md'), 'Outside module')
    await expect(resolveModuleFile(folder, '..notes.md')).resolves.toBe(path.join(folder, '..notes.md'))
    await expect(resolveModuleFile(folder, 'docs/..legacy.txt')).resolves.toBe(path.join(folder, 'docs', '..legacy.txt'))
    await expect(resolveModuleFile(folder, '../module-other/README.md')).rejects.toThrow()
    await symlink(outside, path.join(folder, 'linked'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(resolveModuleFile(folder, 'linked/README.md')).rejects.toThrow('escapes module folder')
    // Directory junctions do not require Windows file-symlink privileges.
    await symlink(path.join(folder, 'docs'), path.join(folder, 'direct-link'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(resolveModuleFile(folder, 'direct-link')).rejects.toThrow('expected a regular file')
    if (process.platform !== 'win32') {
      await symlink(path.join(outside, 'README.md'), path.join(folder, 'README.md'))
      await expect(resolveModuleFile(folder, 'README.md')).rejects.toThrow('expected a regular file')
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

it('names the file on disk when a path differs from it only in letter case, on every host', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'octamod-case-'))
  try {
    await mkdir(path.join(folder, 'src'))
    await writeFile(path.join(folder, 'src', 'retrig.S'), 'assembly')
    await expect(resolveModuleFile(folder, 'src/retrig.S')).resolves.toBe(path.join(folder, 'src', 'retrig.S'))
    await expect(resolveModuleFile(folder, 'src/retrig.s')).rejects.toThrow('the file on disk is named retrig.S')
    await expect(resolveModuleFile(folder, 'SRC/retrig.S')).rejects.toThrow('the file on disk is named src')
    await expect(resolveModuleFile(folder, 'src/missing.S')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(resolveModuleFile(folder, 'presentation/thumbnail.svg')).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(folder, { recursive: true, force: true }) }
})

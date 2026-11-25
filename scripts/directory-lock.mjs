// An exclusive lock on a shared work directory, held until this process exits. A lock whose process is gone is taken over.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const alive = pid => { try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' } }

/** Waits until `directory` is free, takes it and returns the release function. */
export async function lockDirectory(directory, { poll = 5000, waiting = () => {} } = {}) {
  const lock = join(directory, '.lock')
  mkdirSync(directory, { recursive: true })
  for (let said = false; ; await new Promise(done => setTimeout(done, poll))) {
    try {
      mkdirSync(lock)
      writeFileSync(join(lock, 'pid'), String(process.pid))
      const release = () => rmSync(lock, { recursive: true, force: true })
      process.once('exit', release)
      return () => { process.off('exit', release); release() }
    } catch (error) { if (error.code !== 'EEXIST') throw error }
    let pid
    try { pid = Number(readFileSync(join(lock, 'pid'), 'utf8')) } catch { continue } // just taken, its pid not written yet
    if (!alive(pid)) { rmSync(lock, { recursive: true, force: true }); continue }
    if (!said) { waiting(pid); said = true }
  }
}

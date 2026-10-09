import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const python = process.platform === 'win32' ? 'python' : 'python3'
// Repository text is UTF-8, including on Windows hosts with an ANSI locale.
execFileSync(python, ['-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'sdk/tests', '-v'], { cwd: root, stdio: 'inherit', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } })

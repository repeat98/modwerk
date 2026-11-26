import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

// Tests make scratch repositories with `git init` and commit in them. A git hook exports GIT_DIR,
// GIT_INDEX_FILE and friends, which would point those commands at the real repository instead, so
// a fixture commit could land on the developer's branch. The workers inherit this cleaned environment.
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_IMPLICIT_WORK_TREE', 'GIT_PREFIX', 'GIT_GRAFT_FILE',
  'GIT_SHALLOW_FILE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_REPLACE_REF_BASE']) delete process.env[name]

const requestedWorkers = Number(process.env.MODWERK_TEST_WORKERS ?? 4)
if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > 4)
  throw new Error('MODWERK_TEST_WORKERS must be an integer from 1 to 4.')

export default defineConfig({
  test: {
    environment: 'node',
    // Many tests exercise a failure on purpose, and the code under test logs it. With every such line printed, one failed
    // pull request job carried over 100 KB of expected errors around the one that mattered. Print a test's console output
    // only when that test fails; `npx vitest run FILE --silent=false` shows everything again.
    silent: 'passed-only',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'desktop/src/**/*.test.mjs'],
    pool: 'threads',
    // shortcut: no persistent transform cache. An eager import.meta.glob bakes its file list into the importing module's
    // cached transform, keyed only by that module's content, so a new evidence file stayed invisible locally and in CI
    // (SYNTIZ's frame-cost.json, #2124). Re-enable once the cache key covers glob file lists.
    fsModuleCache: false,
    fsModuleCachePath: 'node_modules/.vite/vitest/transforms',
    maxWorkers: Math.min(requestedWorkers, availableParallelism()),
    fileParallelism: true,
    isolate: true,
  },
})

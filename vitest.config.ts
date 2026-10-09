import { availableParallelism } from 'node:os'
import { defineConfig } from 'vitest/config'

const requestedWorkers = Number(process.env.MODWERK_TEST_WORKERS ?? 4)
if (!Number.isInteger(requestedWorkers) || requestedWorkers < 1 || requestedWorkers > 4)
  throw new Error('MODWERK_TEST_WORKERS must be an integer from 1 to 4.')

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    pool: 'threads',
    maxWorkers: Math.min(requestedWorkers, availableParallelism()),
    fileParallelism: true,
    isolate: true,
  },
})

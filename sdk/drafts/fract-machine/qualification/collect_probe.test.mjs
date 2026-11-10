// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('collector dry-run, validation, write reservation and failed socket preserve evidence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fract-collector-'));
  try {
    const output = join(dir, 'result.json');
    const args = ['--socket', join(dir, 'missing.sock'), '--output', output,
      '--base', 'a'.repeat(64), '--label', 'offline-test', '--hardware'];
    const run = extra => spawnSync(process.execPath,
      [fileURLToPath(new URL('./collect_probe.mjs', import.meta.url)), ...args, ...extra],
      { encoding: 'utf8', timeout: 5000 });
    const dry = run(['--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.equal(JSON.parse(dry.stdout).deviceOpened, false);
    assert.equal(existsSync(output), false);
    const bad = run(['--emulator']);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /exactly one/);
    assert.equal(existsSync(output), false);
    writeFileSync(output, 'retained receipt\n');
    const existing = run([]);
    assert.notEqual(existing.status, 0);
    assert.match(existing.stderr, /EEXIST/);
    assert.equal(readFileSync(output, 'utf8'), 'retained receipt\n');
    rmSync(output);
    const failed = run([]);
    assert.equal(failed.status, 1, failed.stderr);
    const result = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(result.state, 'STOPPED_NOT_A_PASS');
    assert.deepEqual(result.windows, []);
    assert.match(result.error, /ENOENT|ECONNREFUSED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

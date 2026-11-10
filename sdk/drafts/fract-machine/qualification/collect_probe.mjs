// SPDX-License-Identifier: MIT
// Explicit socket only. Reads identity, inventory, DIAG and LOAD; never sends
// HELLO, uploads, keys, Keep, removal or a NOR write. Hardware enumeration only
// reads descriptors; emulator enumeration also initializes its simulated USB bus.
import assert from 'node:assert/strict';
import { closeSync, openSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Bench, device, enumerate } from '../../../../scripts/usb-bench.mjs';
import { UsbVendorTransport, findVendorInterface } from '../../../../src/engine/elekloader/upload-usb.ts';
import { diagnostics } from '../../../../src/dev/octatrack-usb-lifecycle.ts';
import { RenderProbeDecoder, requireHardwareClockConsistency } from './probe_decode.mjs';

const { values: args } = parseArgs({ options: {
  socket: { type: 'string' }, output: { type: 'string' }, base: { type: 'string' },
  label: { type: 'string' }, seconds: { type: 'string', default: '20' },
  hardware: { type: 'boolean' }, emulator: { type: 'boolean' }, 'dry-run': { type: 'boolean' }
} });
const seconds = Number(args.seconds);
if (!args.socket || !args.output || !args.label || !/^[a-f0-9]{64}$/.test(args.base ?? '') ||
  Boolean(args.hardware) === Boolean(args.emulator) || !Number.isFinite(seconds) || seconds < 5 || seconds > 120)
  throw new Error('Require --socket --output --base <64hex> --label and exactly one of --hardware/--emulator; --seconds 5..120.');
if (args['dry-run']) {
  console.log(JSON.stringify({ deviceOpened: false, readOnly: true, ...args }));
} else {
  // Reserve the new evidence file before opening even the explicit socket.
  const output = openSync(args.output, 'wx', 0o600);
  let bench;
  const result = { at: new Date().toISOString(), label: args.label, hardware: Boolean(args.hardware),
    expectedBase: args.base, readOnly: true, windows: [], load: [], state: 'STARTING',
    timingScope: args.hardware ? 'Hardware timer/frame consistency required; capture does not grant qualification.' :
      'Emulator diagnostics only. All microseconds use the nominal hardware timer rate; they are not physical performance measurements.',
    packageVerification: 'Operator must retain the separately acknowledged uploader receipt for the named probe. DIAG version alone does not identify the installed package hash.' };
  const decoder = new RenderProbeDecoder();
  try {
    bench = new Bench(args.socket, { timeoutMs: 15000 });
    await bench.ready();
    const raw = device(bench), index = findVendorInterface(await enumerate(bench, Boolean(args.hardware)));
    const transport = new UsbVendorTransport(raw, index, { pollMs: 5 });
    result.identity = await transport.identify(); assert.equal(result.identity.base, args.base);
    result.inventory = await transport.inventory();
    assert.deepEqual(result.inventory.map(row => row.module), ['5efef0cd']);
    const start = performance.now(); let lastLoad = -1000, previous;
    while (performance.now() - start < seconds * 1000) {
      const diag = await diagnostics(raw, index);
      if (previous && (((diag.ticks - previous.ticks) >>> 0) > 1000000 ||
        ((diag.frames - previous.frames) >>> 0) > 1000000))
        throw new Error('Runtime counters restarted or lost continuity; do not combine this capture.');
      previous = { ticks: diag.ticks, frames: diag.frames };
      const window = decoder.push(diag.value);
      if (window) {
        result.windows.push(window); // Preserve the diagnostic window even if its clock check fails.
        if (args.hardware) requireHardwareClockConsistency(window);
      }
      if (performance.now() - lastLoad >= 1000) {
        const identity = await transport.identify(); assert.equal(identity.base, args.base);
        result.load.push(await transport.load()); lastLoad = performance.now();
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!result.windows.length) throw new Error('No complete valid version-3 window; this is not a measurement pass.');
    result.state = 'CAPTURED_NOT_QUALIFIED';
  } catch (error) { result.state = 'STOPPED_NOT_A_PASS'; result.error = String(error); process.exitCode = 1; }
  finally {
    try { writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); }
    finally {
      try { closeSync(output); }
      finally { bench?.socket.end(); }
    }
  }
  console.log(JSON.stringify({ state: result.state, windows: result.windows.length, label: result.label }));
}

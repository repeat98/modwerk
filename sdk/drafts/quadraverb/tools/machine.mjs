// The Quadraverb's controller board around the 8051 core: its external memory map
// as the firmware uses it, an HD44780 display, and MIDI input on the serial port.
// The DSP's program memory is the 384 bytes at 0x0000-0x017f.
// ROMs never enter the repository: pass your own dump (the address-unscrambled
// "usemapped" image, the way the CPU sees it).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { I8051 } from './i8051.mjs';

export const DSP_BYTES = 0x180;

// Images whose layout has been read. Factory programs are 128-byte records at
// `factory` (90 of them); user programs live in battery RAM at 0xce00 + 128 * n.
export const ROMS = {
  '2066a1148efef82e1045d5928315f004': { name: 'Quadraverb 1.07', factory: 0xd2fe },
};

export class Board {
  // signal: the gate's detector reads "signal" all the time (pin P3.2 held low; FIRMWARE.md, "The gate"). Without it every
  // pin reads 1, "no signal".
  constructor(romPath, { signal = false } = {}) {
    this.rom = new Uint8Array(readFileSync(romPath));
    const md5 = createHash('md5').update(this.rom).digest('hex');
    this.known = ROMS[md5];
    if (!this.known) throw new Error(`${romPath}: not a ROM whose layout is known (md5 ${md5}); see ../FIRMWARE.md`);
    this.dsp = new Uint8Array(0x200);
    this.ram = new Uint8Array(0x8000);
    this.lcd = { ddram: new Uint8Array(0x80).fill(0x20), addr: 0 };
    this.dspWrites = 0;
    this.unknown = new Map();
    this.cpu = new I8051(this.rom, {
      xread: (a) => this.xread(a),
      xwrite: (a, v) => this.xwrite(a, v),
      pin: (port) => (signal && port === 0xb0 ? 0xfb : 0xff),
    });
  }

  xread(a) {
    if (a >= 0x8000) return this.ram[a - 0x8000];
    if (a < 0x200) return this.dsp[a];
    this.note('r', a);
    return 0x00;
  }

  xwrite(a, v) {
    if (a >= 0x8000) { this.ram[a - 0x8000] = v; return; }
    if (a < 0x200) { this.dsp[a] = v; this.dspWrites++; return; }
    if ((a & 0xff00) === 0x0200) { this.lcdWrite(a & 1, v); return; }
    if (a === 0x0400 || a === 0x0600 || a === 0x0800) return;
    this.note('w', a);
  }

  note(kind, a) {
    const k = `${kind}${a.toString(16)}`;
    this.unknown.set(k, (this.unknown.get(k) ?? 0) + 1);
  }

  lcdWrite(data, v) {
    const l = this.lcd;
    if (data) { l.ddram[l.addr & 0x7f] = v; l.addr = (l.addr + 1) & 0x7f; return; }
    if (v === 0x01) { l.ddram.fill(0x20); l.addr = 0; }
    else if (v & 0x80) l.addr = v & 0x7f;
    else if ((v & 0xfe) === 0x02) l.addr = 0;
  }

  screen() {
    const row = (base) => String.fromCharCode(...this.lcd.ddram.subarray(base, base + 16));
    return `${row(0)}|${row(0x40)}`;
  }

  run(cycles) {
    const end = this.cpu.cycles + cycles;
    while (this.cpu.cycles < end) this.cpu.step();
  }

  midi(...bytes) { this.cpu.serialIn.push(...bytes); }

  // Copy the 90 factory programs into user programs 0-89 (what RECALL ALL does) and boot.
  boot() {
    const f = this.known.factory;
    for (let k = 0; k < 90; k++) this.ram.set(this.rom.subarray(f + 0x80 * k, f + 0x80 * (k + 1)), 0x4e00 + 0x80 * k);
    this.run(3_000_000);
    return this;
  }

  // Recall a user program by MIDI program change and let the firmware build its DSP program.
  recall(p) { this.midi(0xc0, p); this.run(1_500_000); return this.program(); }

  // A user program's 128-byte record in battery RAM, for editing parameters before a recall.
  record(p) { return this.ram.subarray(0x4e00 + 0x80 * p, 0x4e80 + 0x80 * p); }

  // The program the DSP holds now: 96 steps of [address, coefficient, op].
  program() {
    const d = this.dsp, out = [];
    for (let i = 0; i < DSP_BYTES; i += 4) out.push([d[i] | (d[i + 1] << 8), d[i + 2], d[i + 3]]);
    return out;
  }
}

// A model of the Quadraverb's DSP in floating point, inferred from programs whose purpose
// is known (../README.md, "The DSP"). Word width and saturation are not modelled yet.
//
// A step is { a: delay address, k: coefficient 0 .. 2047/2048, op: 5 bits }.
//   bit 4  negate the product        bit 3  write (else read)
//   bit 2  latch                     bits 1-0  select
// Read:  A = s*k*mem + add; add by select: 00 0 | 01 A | 10 A | 11 A + M (A alone when bit 2 is set)
// Write: mem = A, then A = s*k*A + add; add by select: 00 0 | 01 A (0 when bit 2 is set) | 10 B | 11 M
// Latch: a read latches the memory word, a write the accumulator from before the step, into M
//        when bit 0 is set and into B when it is clear. Adds see the register's old value.
// Delay memory: 64K words. The pointer counts down once a sample, so a word written at
// address n is read at n + d after d samples.
// I/O: the write at step 0x5e stores the input sample, and its latch catches it too. The words
// read at steps 0x00 and 0x5f are the left and right outputs. The pointer steps between 0x5e
// and 0x5f, so a frame runs 0x5f, 0x00 .. 0x5e.

export const decode = (prog) => prog.map(([a, c, o]) => ({ a, k: ((c << 3) | (o >> 5)) / 2048, op: o & 0x1f }));

export const FRAME = [0x5f, ...Array.from({ length: 95 }, (_, i) => i)];

export class QV {
  constructor(steps) {
    this.steps = steps;
    this.mem = new Float64Array(0x10000);
    this.ptr = 0;
    this.A = 0;
    this.B = 0;
    this.M = 0;
    this.left = 0;
    this.right = 0;
  }

  // Run step i; x is the input sample, stored by step 0x5e.
  step(i, x = 0) {
    const { a, k, op } = this.steps[i];
    const s = op & 0x10 ? -k : k, sel = op & 3, latch = op & 4;
    const cell = (a + this.ptr) & 0xffff, A = this.A;
    let word;
    if (op & 8) {
      word = i === 0x5e ? x : A;
      this.mem[cell] = word;
      this.A = s * A + (sel === 0 ? 0 : sel === 1 ? (latch ? 0 : A) : sel === 2 ? this.B : this.M);
    } else {
      word = this.mem[cell];
      if (i === 0) this.left = word;
      else if (i === 0x5f) this.right = word;
      this.A = s * word + (sel === 0 ? 0 : sel < 3 || latch ? A : A + this.M);
    }
    if (latch) {
      if (op & 1) this.M = word;
      else this.B = word;
    }
  }

  // One sample in, [left, right] out. tap(i, A) sees the accumulator after each step.
  sample(x, tap) {
    for (const i of FRAME) {
      this.step(i, x);
      if (tap) tap(i, this.A);
    }
    this.ptr = (this.ptr - 1) & 0xffff;
    return [this.left, this.right];
  }
}

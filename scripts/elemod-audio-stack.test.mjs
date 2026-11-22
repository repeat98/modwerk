import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { AUDIO_STACK_FLAGS, checkAudioStack, deepest, fieldOffsets, loadAudioStack, parseCallgraph } from './elemod-audio-stack.mjs'

const node = (title, bytes, qualifier = 'static') => `node: { title: "${title}" label: "${title.split(':').pop()}\\nf.c:1:1\\n${bytes} bytes (${qualifier})" }\n`
const edge = (a, b) => `edge: { sourcename: "${a}" targetname: "${b}" label: "f.c:2:3" }\n`
const external = title => `node: { title: "${title}" label: "${title}\\nf.c:1:1" shape : ellipse }\n`

describe('audio stack: the call graph', () => {
  it('adds a frame, a return address and the deepest callee', () => {
    const g = parseCallgraph(node('run', 40) + node('f.c:small', 8) + node('f.c:big', 100) + external('base_fn') + edge('run', 'f.c:small') + edge('run', 'f.c:big') + edge('f.c:big', 'base_fn'))
    const r = deepest(g, 'run')
    expect(r.bytes).toBe(40 + 4 + 100 + 4)
    expect(r.chain).toEqual(['run 40 B', 'big 100 B'])
    expect(r.unknown).toEqual(['base_fn'])
  })
  it('never charges a call by name to another file\'s static of that name', () => {
    const g = parseCallgraph(node('run', 40) + external('copy_block') + edge('run', 'copy_block') + node('menu.c:copy_block', 1200))
    expect(deepest(g, 'run').bytes).toBe(40 + 4)
  })
  it('refuses recursion and a stack sized at run time', () => {
    expect(() => deepest(parseCallgraph(node('a', 8) + node('b', 8) + edge('a', 'b') + edge('b', 'a')), 'a')).toThrow(/recursion/)
    expect(() => deepest(parseCallgraph(node('a', 8, 'dynamic')), 'a')).toThrow(/run time/)
    expect(deepest(parseCallgraph(node('a', 8, 'dynamic,bounded')), 'a').bytes).toBe(8)
  })
})

// With the cross compiler (as CI's container has), a record's run with 1.8 KB of locals fails and a static buffer
// passes; the same code from a UI event is not checked.
let cross = true
try { execFileSync('m68k-elf-gcc', ['--version']) } catch { cross = false }
describe.skipIf(!cross)('audio stack: a compiled module', () => {
  const root = resolve(import.meta.dirname, '..')
  const config = loadAudioStack(root, 'analog-rytm-mkii')
  const cflags = ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib', '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables']
  const works = []
  afterAll(() => { for (const w of works) rmSync(w, { recursive: true, force: true }) })
  const includes = ['-I', resolve(root, 'sdk/machines/analog-rytm-mkii/include')]
  const run = (tool, args) => execFileSync('m68k-elf-' + tool, args, { encoding: 'utf8' })
  // sources: one C body, or several; contribute: the records' relocations (default: my_fx).
  const build = (bodies, subscribe = [], relocs = [[0, 'abs32', 'sym:my_fx', 0]]) => {
    const work = mkdtempSync(resolve(tmpdir(), 'audio-stack-')); works.push(work)
    const objects = [bodies].flat().map((body, i) => {
      const asm = typeof body === 'object', object = resolve(work, i + '.o')
      const source = resolve(work, 'm' + i + (asm ? '.s' : '.c'))
      writeFileSync(source, asm ? body.asm : '#include "modwerk/fx.h"\n' + body)
      run('gcc', [...cflags, ...(asm ? [] : [...AUDIO_STACK_FLAGS, ...includes]), '-c', source, '-o', object])
      return { source, object, callgraph: resolve(work, i + '.ci'), c: !asm }
    })
    const offsets = fieldOffsets(config, { run, work, includes, cflags })
    const b = { subscribe, contribute: [{ to: 'mw_fx', relocs }] }
    return () => checkAudioStack({ config, offsets, build: b, objects, label: 'test' })
  }
  const fx = 'const struct mw_fx my_fx = { MW_FX_ABI, 1, 0, 0, 256, 0, "T", {{"A", 0, 0, 0}}, reset, render, 0 };\n'
  it('fails on large locals in render and names the fix', () => {
    const check = build('static void reset(int *w) { (void)w; }\nstatic void use(int *b);\n' +
      'static void render(const int *x, int *l, int *r, const unsigned char *p, int *w) { int buf[450]; for (int i = 0; i < 450; i++) buf[i] = x[i & 31]; use(buf); l[0] = r[0] = buf[7]; (void)p; (void)w; }\n' +
      'static void use(int *b) { b[1]++; }\n' + fx)
    expect(check).toThrow(/mw_fx my_fx.render runs in the audio interrupt .* static memory/)
  })
  it('passes the same work with a static buffer', () => {
    const check = build('static void reset(int *w) { (void)w; }\nstatic int buf[450];\n' +
      'static void render(const int *x, int *l, int *r, const unsigned char *p, int *w) { for (int i = 0; i < 450; i++) buf[i] = x[i & 31]; l[0] = r[0] = buf[7]; (void)p; (void)w; }\n' + fx)
    expect(check().map(r => r.what)).toEqual(['mw_fx my_fx.reset', 'mw_fx my_fx.render'])
  })
  it('checks an audio event handler, not a UI one', () => {
    const body = 'static void reset(int *w) { (void)w; }\nstatic void render(const int *x, int *l, int *r, const unsigned char *p, int *w) { (void)x; (void)l; (void)r; (void)p; (void)w; }\n' + fx +
      'void big(void) { volatile int a[600]; a[3] = 1; }\n'
    expect(build(body, [{ event: 'ev_render_out', fn: 'big' }])).toThrow(/ev_render_out big/)
    expect(build(body, [{ event: 'ev_tick', fn: 'big' }])().length).toBe(2)
  })
  const big = 'void big_render(const int *x, int *l, int *r, const unsigned char *p, int *w) { volatile int a[600]; a[3] = x[0]; l[0] = r[0] = a[3]; (void)p; (void)w; }\n'
  const small = 'void small_render(const int *x, int *l, int *r, const unsigned char *p, int *w) { l[0] = r[0] = x[0]; (void)p; (void)w; }\nvoid nop_reset(int *w) { (void)w; }\n'
  it('follows a record to a function in another source', () => {
    expect(build(['void nop_reset(int *w);\nvoid big_render(const int *x, int *l, int *r, const unsigned char *p, int *w);\nconst struct mw_fx my_fx = { MW_FX_ABI, 1, 0, 0, 256, 0, "T", {{"A", 0, 0, 0}}, nop_reset, big_render, 0 };\n',
      big + 'void nop_reset(int *w) { (void)w; }\n'])).toThrow(/my_fx.render .*big_render/)
  })
  it('finds a weak render and a static event handler', () => {
    const weak = '__attribute__((weak)) ' + big + 'static void nop(int *w) { (void)w; }\nconst struct mw_fx my_fx = { MW_FX_ABI, 1, 0, 0, 256, 0, "T", {{"A", 0, 0, 0}}, nop, big_render, 0 };\n'
    expect(build(weak)).toThrow(/my_fx.render/)
    const handler = small + 'const struct mw_fx my_fx = { MW_FX_ABI, 1, 0, 0, 256, 0, "T", {{"A", 0, 0, 0}}, nop_reset, small_render, 0 };\nstatic void blk(void) { volatile int a[600]; a[3] = 1; }\nvoid (*keep)(void) = blk;\n'
    expect(build(handler, [{ event: 'ev_render_out', fn: 'blk' }])).toThrow(/ev_render_out blk .* 2[0-9]{3} B/)
  })
  it('checks every record of a contributed array', () => {
    const two = small + big + 'const struct mw_fx fxs[2] = { { MW_FX_ABI, 1, 0, 0, 256, 0, "A", {{"A", 0, 0, 0}}, nop_reset, small_render, 0 }, { MW_FX_ABI, 2, 0, 0, 256, 0, "B", {{"A", 0, 0, 0}}, nop_reset, big_render, 0 } };\n'
    expect(build(two, [], [[0, 'abs32', 'sym:fxs', 0]])().length).toBe(2)
    expect(build(two, [], [[0, 'abs32', 'sym:fxs', 0], [0, 'abs32', 'sym:fxs', 100]])).toThrow(/fxs\+100.render/)
  })
  it('binds a call to the definition the linker picks, not another file\'s static of that name', () => {
    const audio = 'void copy_block(int *d);\nstatic void nop(int *w) { (void)w; }\nstatic void render(const int *x, int *l, int *r, const unsigned char *p, int *w) { copy_block(l); r[0] = x[0]; (void)p; (void)w; }\n' +
      'const struct mw_fx my_fx = { MW_FX_ABI, 1, 0, 0, 256, 0, "T", {{"A", 0, 0, 0}}, nop, render, 0 };\n'
    const menu = 'static void copy_block(int *d) { volatile int a[300]; a[3] = d[0]; d[1] = a[3]; }\nvoid menu_open(int *d) { copy_block(d); }\n'
    const asm = { asm: '\t.text\n\t.globl copy_block\ncopy_block:\n\trts\n' }
    expect(build([audio, menu, asm])().find(r => r.what.endsWith('.render')).bytes).toBeLessThan(64)
    expect(build([audio, menu])().find(r => r.what.endsWith('.render')).bytes).toBeLessThan(64)
    expect(build([audio, menu.replace('static void copy_block', '__attribute__((weak)) void copy_block')])).toThrow(/my_fx.render .*copy_block 1[0-9]{3} B/)
  })
})

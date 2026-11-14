import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { oddJumpsIn, oddJumpsInElemod, oddJumpsInFiles, type Machine } from './odd-jumps'
import { devices } from '../../../vendor/elekloader/kit/src/devices.ts'

// A synthetic machine: its "stock" image is 0x40000000-0x40001000 and its module RAM 0x41000000-0x41001000. No
// Elektron firmware is involved.
const machine: Machine = { mainLoad: 0x40000000, mainLength: 4096, areas: [[0x41000000, 0x41001000]] }
type Doc = Parameters<typeof oddJumpsInElemod>[0]
const doc = (run: unknown[], extra: Record<string, unknown> = {}) => ({ elemod: 2, id: 'mod', version: '1.0', sections: { '.run': { parts: run } }, ...extra }) as Doc
const run = (hex: string, extra: Record<string, unknown> = {}) => oddJumpsInElemod(doc([['hex', hex]], extra), machine)
// jsr 0 with its operand left to a relocation, rts, one byte of data, then a routine at the odd offset 9.
const CALL = '4eb900000000' + '4e75' + '00' + '4e75'

describe('jsr and jmp to an odd address', () => {
  it('refuses a jsr whose relocation lands on an odd offset of the package', () => {
    const symbols = { routine: ['.run', 9], even: ['.run', 6] }
    expect(run(CALL, { symbols, relocs: [['.run', 2, 'abs32', 'sym:routine', 0]] })).toEqual(['.run+0x0: jsr to routine (.run+0x9), an odd address'])
    expect(run(CALL, { symbols, relocs: [['.run', 2, 'abs32', 'sym:even', 3]] })).toEqual(['.run+0x0: jsr to even+3 (.run+0x9), an odd address'])
    expect(run(CALL, { relocs: [['.run', 2, 'abs32', 'sec:.run', 9]] })).toEqual(['.run+0x0: jsr to .run+0x9, an odd address'])
  })

  it('refuses a jmp to an odd address of the stock image, written out or through an absolute symbol', () => {
    expect(run('4e714ef940000101')).toEqual(['.run+0x2: jmp to 0x40000101, an odd address'])
    expect(run('4ef900000000', { symbols: { STOCK: ['abs', '0x40000101'] }, relocs: [['.run', 2, 'abs32', 'sym:STOCK', 0]] })).toEqual(['.run+0x0: jmp to STOCK (0x40000101), an odd address'])
    expect(run('4ef900000000', { relocs: [['.run', 2, 'abs32', 'abs', 0x41000003]] })).toEqual(['.run+0x0: jmp to 0x41000003, an odd address'])
  })

  it('refuses one in a site, by the site\'s address', () => {
    const site = { addr: '0x40000100', len: 8, new: '4e714eb900000000', kind: 'code', relocs: [[4, 'abs32', 'sym:routine', 0]] }
    expect(run(CALL, { symbols: { routine: ['.run', 9] }, sites: [site] })).toEqual(['site 0x40000100+0x2: jsr to routine (.run+0x9), an odd address'])
  })

  it('passes jumps to even addresses', () => {
    expect(run('4eb940000100' + '4ef941000ffe')).toEqual([])
    expect(run(CALL, { symbols: { even: ['.run', 6], STOCK: ['abs', '0x40000100'] }, relocs: [['.run', 2, 'abs32', 'sym:even', 0]], sites: [{ addr: '0x40000100', len: 6, new: '4ef900000000', kind: 'code', relocs: [[2, 'abs32', 'sym:STOCK', 0]] }] })).toEqual([])
  })

  it('ignores the pattern at an odd address, where no instruction starts', () => {
    expect(run('00' + '4eb940000101' + '00')).toEqual([])
    const bytes = Uint8Array.from([0x00, 0x4e, 0xb9, 0x40, 0x00, 0x01, 0x01, 0x00]), anywhere = () => true
    expect(oddJumpsIn(bytes, 0, [], anywhere)).toEqual([])
    expect(oddJumpsIn(bytes, 1, [], anywhere)).toEqual([{ offset: 1, op: 'jsr', target: '0x40000101' }])
  })

  it('does not take the same bytes for a jump where the package shows they are a number', () => {
    // cmpi.l #0x4eb9,d0 then a branch: the "operand" 0x67000101 is no address of this machine
    expect(run('0c8000004eb967000101')).toEqual([])
    // a table whose words happen to read 4ef9, then an odd value outside the image and the module RAM
    expect(run('b5b64ef9b5b6e25bb5b7')).toEqual([])
    // the opcode's two bytes are the low half of a relocated address
    expect(run('00004eb941000001', { relocs: [['.run', 0, 'abs32', 'sec:.run', 0]] })).toEqual([])
    // the "operand" is a pc-relative reference
    expect(run('4eb941000001', { relocs: [['.run', 2, 'pc32', 'sec:.run', 1]] })).toEqual([])
    // the operand is stock bytes the package does not hold
    expect(oddJumpsInElemod(doc([['hex', '4eb9'], ['stock', '0x40000100', 4]]), machine)).toEqual([])
    // a table entry is data: contributions are not read, and neither is a section of DSP words
    expect(run('4e75', { contribute: [{ to: 'ev_tick', data: '4ef94100000100000000', relocs: [] }] })).toEqual([])
    expect(oddJumpsInElemod({ sections: { '.dsp': { parts: [['hex', '4ef941000001']] } } }, machine)).toEqual([])
  })

  it('follows an import to the package that exports it, and leaves it alone where none does', () => {
    const core = (offset: number) => ({ ...doc([['hex', '4e714e754e75']], { symbols: { core_draw: ['.run', offset] }, exports: ['core_draw'] }), id: 'core', version: '2.1' })
    const mod = doc([['hex', '4eb900000000']], { imports: ['core_draw'], relocs: [['.run', 2, 'abs32', 'sym:core_draw', 0]] })
    expect(oddJumpsInElemod(mod, machine)).toEqual([])
    expect(oddJumpsInElemod(mod, machine, [core(2), mod])).toEqual([])
    expect(oddJumpsInElemod(mod, machine, [core(2), core(3), mod])).toEqual(['.run+0x0: jsr to core 2.1 core_draw (.run+0x3), an odd address'])
  })

  it('takes .boot to start where the stock image ends', () => {
    const boot: Doc = { sections: { '.boot': { parts: [['hex', '4eb900000000']] } }, relocs: [['.boot', 2, 'abs32', 'sec:.boot', 4]] }
    expect(oddJumpsInElemod(boot, machine)).toEqual([])
    expect(oddJumpsInElemod(boot, { ...machine, mainLength: 4097 })).toEqual([])   // the opcode itself is at an odd address
    expect(oddJumpsInElemod({ sections: { '.boot': { parts: [['hex', '004eb900000000']] } }, relocs: [['.boot', 3, 'abs32', 'sec:.boot', 4]] }, { ...machine, mainLength: 4097 })).toEqual(['.boot+0x1: jsr to .boot+0x4, an odd address'])
  })

  it('names the file, reads imports across the files for one firmware only, and reports a file it cannot read', () => {
    const file = (name: string, value: unknown, firmware = 'test 1.0') => ({ name, bytes: new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)), firmware, machine })
    const core = (offset: number) => ({ ...doc([['hex', '4e714e754e75']], { symbols: { core_draw: ['.run', offset] }, exports: ['core_draw'] }), id: 'core' })
    const mod = doc([['hex', '4eb900000000' + '4ef940000101']], { imports: ['core_draw'], relocs: [['.run', 2, 'abs32', 'sym:core_draw', 0]] })
    expect(oddJumpsInFiles([file('core-os2.elemod', core(3), 'test 2.0'), file('core.elemod', core(2)), file('mod.elemod', mod)])).toEqual(['mod.elemod .run+0x6: jmp to 0x40000101, an odd address'])
    expect(oddJumpsInFiles([file('core.elemod', core(3)), file('mod.elemod', mod), file('broken.elemod', '{'), file('wrong.elemod', { sites: [{ addr: 'here', new: '' }] })])).toEqual([
      expect.stringMatching(/^broken\.elemod: not a package the odd-address check can read \(/),
      'mod.elemod .run+0x0: jsr to core 1.0 core_draw (.run+0x3), an odd address', 'mod.elemod .run+0x6: jmp to 0x40000101, an odd address',
      'wrong.elemod: not a package the odd-address check can read ("here" is not a number)',
    ])
  })

  it('finds none in the packages this repository holds', () => {
    const files = ['vendor/elekloader/catalog', 'sdk/imports/packages'].flatMap(folder => {
      const root = fileURLToPath(new URL('../../../' + folder + '/', import.meta.url))
      return readdirSync(root, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.elemod')).sort().map(name => {
        const bytes = readFileSync(root + name), { target } = JSON.parse(bytes.toString()) as { target: { device: string; os: string } }
        const device = devices().find(device => device.key === target.device)!, release = device.releases.find(release => release.version === target.os)!
        return { name: folder + '/' + name.replaceAll('\\', '/'), bytes, firmware: target.device + ' ' + target.os, machine: { mainLoad: device.mainLoad, mainLength: release.mainLen, areas: [...Object.values(device.areas), device.ddr, device.sramCode] } }
      })
    })
    expect(files.length).toBeGreaterThan(100)
    expect(oddJumpsInFiles(files)).toEqual([])
  })
})

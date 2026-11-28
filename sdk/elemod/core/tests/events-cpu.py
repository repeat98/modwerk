# SPDX-License-Identifier: GPL-3.0-or-later
"""Compiled event adapters/API against independent synthetic callbacks and ISA fixtures."""
import json
import struct
import sys
from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, UC_HOOK_CODE
from unicorn.m68k_const import (
    UC_CPU_M68K_CFV4E, UC_M68K_REG_D0, UC_M68K_REG_D1, UC_M68K_REG_D2,
    UC_M68K_REG_D3, UC_M68K_REG_D4, UC_M68K_REG_D5, UC_M68K_REG_D6,
    UC_M68K_REG_D7, UC_M68K_REG_A0, UC_M68K_REG_A1, UC_M68K_REG_A2,
    UC_M68K_REG_A3, UC_M68K_REG_A4, UC_M68K_REG_A5, UC_M68K_REG_A6,
    UC_M68K_REG_A7, UC_M68K_REG_SR, UC_M68K_REG_PC,
)
REGS = [UC_M68K_REG_D0, UC_M68K_REG_D1, UC_M68K_REG_D2, UC_M68K_REG_D3,
        UC_M68K_REG_D4, UC_M68K_REG_D5, UC_M68K_REG_D6, UC_M68K_REG_D7,
        UC_M68K_REG_A0, UC_M68K_REG_A1, UC_M68K_REG_A2, UC_M68K_REG_A3,
        UC_M68K_REG_A4, UC_M68K_REG_A5, UC_M68K_REG_A6]
RET, SP, MENU, ROW, ITEM, FRAME = 0x40000010, 0x41008000, 0x41004000, 0x41004100, 0x41006000, 0x41005000
SET, GET, RECORD, AUX_SP = 0x41002000, 0x41002200, 0x41002500, 0x41009000
total = 0

def words(uc, address, count):
    return list(struct.unpack('>' + 'I' * count, uc.mem_read(address, 4 * count)))

for case in json.load(open(sys.argv[1], encoding='utf8')):
    modes = [0, 0x10, 0x20, 0x70] if case['event'].startswith('render') else [0]
    for status in [0x2000, 0x201f, 0x270a]:
        for mac_mode in modes:
            uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
            uc.ctl_set_cpu_model(UC_CPU_M68K_CFV4E)
            uc.mem_map(0x40000000, 0x200000)
            uc.mem_map(0x47be0000, 0x20000)
            uc.mem_map(0x41000000, 0x10000)
            uc.reg_write(UC_M68K_REG_SR, 0x2000)
            uc.reg_write(UC_M68K_REG_A7, SP)
            image = bytes.fromhex(case['image'])
            uc.mem_write(case['imageBase'], image)
            uc.mem_write(0x41000000, b'\x6b' * 0x10000)
            lo, hi = case['layout']['ddr']
            source = case['layout']['runLoad'] - case['imageBase']
            uc.mem_write(lo, image[source:source + hi - lo])
            a, b = case['layout']['bss']
            uc.mem_write(a, bytes(b - a))
            uc.mem_write(SET, bytes.fromhex(case['emacHarness']['set']))
            uc.mem_write(GET, bytes.fromhex(case['emacHarness']['get']))

            def emac(kind, record=None):
                saved = [(r, uc.reg_read(r)) for r in REGS + [UC_M68K_REG_SR, UC_M68K_REG_A7, UC_M68K_REG_PC]]
                if record is not None:
                    uc.mem_write(RECORD, struct.pack('>8I', *record))
                uc.mem_write(AUX_SP, struct.pack('>II', RET, RECORD))
                uc.reg_write(UC_M68K_REG_SR, 0x2000)
                uc.reg_write(UC_M68K_REG_A7, AUX_SP)
                uc.emu_start(SET if kind == 'set' else GET, RET, count=1000)
                assert uc.reg_read(UC_M68K_REG_PC) == RET, 'EMAC harness failed'
                result = words(uc, RECORD, 8)
                for reg, value in saved:
                    uc.reg_write(reg, value)
                return result

            emac('set', [0x12345678, 0x87654321, 0x7ffffffe, 0x80000002, 0x00a5005a, 0x003c00c3, 0xffff7fff, mac_mode])
            original_mac = emac('get')
            assert emac('get') == original_mac, 'EMAC harness changes state'
            values = [0x12345000 + 0x123 * i for i in range(15)]
            values[10] = MENU
            values[14] = FRAME
            for reg, value in zip(REGS, values): uc.reg_write(reg, value)
            uc.reg_write(UC_M68K_REG_SR, status)
            uc.reg_write(UC_M68K_REG_A7, SP)
            uc.mem_write(MENU, struct.pack('>I', 0x41005500))
            restore_values = [0x33440000 + i * 13 for i in range(7)]
            uc.mem_write(FRAME - 40, struct.pack('>7I', *restore_values))
            row = [0x41001200 + i * 0x100 for i in range(4)]
            if case['mode'] == 'missing-callback': row[2] = 0
            uc.mem_write(ROW, struct.pack('>4I', *row))
            args = [0 if case['mode'] == 'null-menu' else MENU, 0 if case['mode'] == 'null-row' else ROW] if case['event'] == 'api' else []
            stack = struct.pack('>' + 'I' * (1 + len(args)), RET, *args)
            uc.mem_write(SP, stack)
            callbacks = set(case['handlers']) | (set(case['helperCalls'].values()) if case['event'] == 'api' else {case['continuation']})
            hits = []
            constructed = False
            def intercept(_uc, address, _size, _data):
                if address in callbacks: _uc.emu_stop()
            uc.hook_add(UC_HOOK_CODE, intercept)
            pc = case['entry']
            for _ in range(12):
                uc.emu_start(pc, RET, count=100_000)
                pc = uc.reg_read(UC_M68K_REG_PC)
                if pc == RET or pc == case['continuation']: break
                assert pc in callbacks, 'Unexpected callback'
                sp = uc.reg_read(UC_M68K_REG_A7)
                if case['event'] != 'api':
                    hits.append(pc)
                    if case['event'] == 'settings': assert words(uc, sp + 4, 1) == [MENU]
                    else: emac('set', [1, 2, 3, 4, 0, 0, 0xffff0000, 0x70 ^ mac_mode])
                    uc.reg_write(UC_M68K_REG_D0, 0xdeadbeef)
                    uc.reg_write(UC_M68K_REG_D1, 0xdeadbeef)
                    uc.reg_write(UC_M68K_REG_A0, 0x41007000)
                    uc.reg_write(UC_M68K_REG_A1, 0x41007100)
                    uc.reg_write(UC_M68K_REG_SR, 0x240f)
                elif pc == case['helperCalls']['mw_stock_allocate']:
                    hits.append('allocate')
                    assert words(uc, sp + 4, 1) == [84]
                    uc.reg_write(UC_M68K_REG_D0, 0 if case['mode'] == 'no-memory' else ITEM)
                elif pc == case['helperCalls']['mw_stock_item_construct']:
                    hits.append('construct')
                    got = words(uc, sp + 4, 7)
                    assert got[0] == ITEM and got[5:] == [0xffffffff, 8]
                    for i, address in enumerate(got[1:5]):
                        expected = [MENU if i in (1, 3) else 0, 0, case['helperCalls']['mw_stock_function_manager'] if row[i] else 0, row[i]]
                        assert words(uc, address, 4) == expected, 'Stock callback record ABI changed'
                    constructed = True
                else:
                    hits.append('append')
                    assert pc == case['helperCalls']['mw_stock_menu_append'] and constructed
                    assert words(uc, sp + 4, 2) == [MENU, ITEM]
                pc = words(uc, sp, 1)[0]
                uc.reg_write(UC_M68K_REG_A7, sp + 4)
                uc.reg_write(UC_M68K_REG_PC, pc)
            if case['event'] == 'api':
                assert pc == RET and uc.reg_read(UC_M68K_REG_A7) == SP + 4
                expected_hits = [] if case['mode'].startswith('null') else ['allocate'] if case['mode'] == 'no-memory' else ['allocate', 'construct', 'append']
                assert hits == expected_hits, 'Allocator/constructor/menu order changed'
                assert [uc.reg_read(r) for r in REGS[2:8] + REGS[10:]] == values[2:8] + values[10:], 'API clobbered callee-saved state'
                assert bytes(uc.mem_read(SP, len(stack))) == stack
            else:
                assert pc == case['continuation'] and hits == case['handlers'], 'Event order/continuation changed'
                expected = list(values)
                if case['event'] == 'settings': expected[8] = 0x41005500
                if case['event'] == 'render_in': expected[0] = 0x135790
                if case['event'] == 'render_out': expected[0:4], expected[8:11] = restore_values[:4], restore_values[4:]
                assert [uc.reg_read(r) for r in REGS] == expected, 'Registers changed outside the synthetic displaced block'
                assert uc.reg_read(UC_M68K_REG_SR) == (status & ~15 if case['event'] == 'render_in' else status), 'Status changed'
                assert uc.reg_read(UC_M68K_REG_A7) == (SP if case['event'] == 'settings' else SP + 4), 'Inline resume stack changed'
                if case['event'] == 'settings': assert words(uc, SP, 1) == [85]
                if case['event'].startswith('render'): assert emac('get') == original_mac, 'Render callback leaked EMAC state'
            assert bytes(uc.mem_read(SP - 512, 16)) == b'\x6b' * 16, 'Stack guard overwritten'
            total += 1
    print(case['machine'] + '/' + case['release'] + '/' + case['event'] + '/' + case['mode'] + ': passed')
print(str(total) + ' synthetic common-event/API CPU cases passed')

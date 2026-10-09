"""Check the assembled chooser hooks and both Part copies, without stock bytes in Git."""
import argparse
import hashlib
import json
import struct
import subprocess
from pathlib import Path
from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN
from unicorn import m68k_const as regs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    runtime = args.sdk / 'out/platform/runtime'
    nm = subprocess.check_output(['m68k-elf-nm', str(runtime / 'runtime.elf')], text=True)
    symbols = {f[2]: int(f[0], 16) for f in (line.split() for line in nm.splitlines()) if len(f) == 3}
    headers = subprocess.check_output(['m68k-elf-objdump', '-h', str(runtime / 'runtime.elf')], text=True)
    base = int(next(line.split()[3] for line in headers.splitlines() if len(line.split()) > 3 and line.split()[1] == '.text'), 16)
    uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
    uc.ctl_set_cpu_model(regs.UC_CPU_M68K_CFV4E)
    for address, length in ((0x40000000, 0x02000000), (0x42000000, 0xa0000),
                            (0x10000000, 0x100000), (0x460d5000, 0x1000),
                            (0x46c82000, 0x1000), (0x10000, 0x20000),
                            (0x80000000, 0x10000)):
        uc.mem_map(address, length)
    uc.mem_write(0x40000400, (args.sdk / 'out/raw/section_3_MAIN_OS.bin').read_bytes())
    uc.mem_write(base, (runtime / 'runtime.bin').read_bytes())
    defaults = bytes(uc.mem_read(0x400d320c, 12))
    bank, live, shadow, stride = 0x42000000, 0x4208ed80, 0x100a4ece, 6322
    uc.mem_write(0x46c82456, struct.pack('>I', bank))
    registers = [getattr(regs, 'UC_M68K_REG_' + name + str(i)) for name, n in (('D', 8), ('A', 7)) for i in range(n)]
    d0, d1, d2, d4 = [getattr(regs, 'UC_M68K_REG_D'+str(i)) for i in (0, 1, 2, 4)]
    a0, a1 = regs.UC_M68K_REG_A0, regs.UC_M68K_REG_A1
    stack, stop = 0x20000, 0x10000
    seed = bytes((i * 17 + 3) % 256 for i in range(4 * stride))
    results = []

    def run(name, until=stop):
        uc.reg_write(regs.UC_M68K_REG_SR, 0x2000)
        uc.reg_write(regs.UC_M68K_REG_A7, stack)
        uc.mem_write(stack, struct.pack('>I', stop))
        before = [uc.reg_read(reg) for reg in registers]
        uc.emu_start(symbols[name], until, count=10000)
        assert uc.reg_read(regs.UC_M68K_REG_PC) == until, name
        expected_sp = stack + 4 if until == stop else stack
        assert uc.reg_read(regs.UC_M68K_REG_A7) == expected_sp, (name, 'stack')
        return before

    for part in range(4):
        for track in range(8):
            for hook, until in (('ab_sig_write', stop), ('ab_main_commit', 0x40079822),
                                ('ab_src_commit', 0x4005a61c), ('ab_src_commit2', 0x4005a856)):
                for signature in (b'AB\x01', b'\0\0\0', b'AX\x01', b'AB\x00'):
                    for reg, value in zip(registers, range(0x12340000, 0x12340000 + len(registers))):
                        uc.reg_write(reg, value)
                    first, second = live + stride * part, shadow + stride * part
                    row = 30 * track
                    copies = []
                    for origin in (live, shadow):
                        raw = bytearray(seed)
                        raw[stride*part+60+row:stride*part+63+row] = signature
                        uc.mem_write(origin, bytes(raw))
                        expected = bytearray(raw)
                        if signature == b'AB\x01':
                            for page, values in ((0x2a, defaults[:6]), (0x1da, defaults[6:])):
                                at = stride*part+page+row+6
                                expected[at:at+6] = values
                            expected[stride*part+60+row:stride*part+63+row] = bytes(3)
                        copies.append(expected)
                    uc.reg_write(a0, first if hook == 'ab_sig_write' else first+0x22+track)
                    uc.reg_write(a1, bank)
                    uc.reg_write(d0, track if hook == 'ab_sig_write' else stride*part)
                    uc.reg_write(d1, 0 if hook == 'ab_sig_write' else track)
                    uc.reg_write(d2, track)
                    uc.reg_write(d4, 1)
                    uc.mem_write(0x460d5c30, struct.pack('>I', 1))
                    if hook == 'ab_main_commit':
                        copies[0][stride*part+0x22+track] = 1
                    before = run(hook, until)
                    for origin, expected in zip((live, shadow), copies):
                        assert bytes(uc.mem_read(origin, len(expected))) == bytes(expected), (hook, part, track, signature, hex(origin))
                    if hook == 'ab_sig_write':
                        assert [uc.reg_read(reg) for reg in registers] == before, 'signature writer ABI'
                    elif hook.startswith('ab_src_commit'):
                        for reg in (d0, d2, a0, a1):
                            assert uc.reg_read(reg) == before[registers.index(reg)], (hook, 'ABI', reg)
                        assert uc.reg_read(d1) == 1, 'requested FLEX row'
                    results.append({'hook': hook, 'part': part, 'track': track, 'signed': signature == b'AB\x01'})
            # Existing patch data must survive selecting Analog BD again.
            uc.mem_write(live, seed); uc.mem_write(shadow, seed)
            for origin in (live, shadow):
                uc.mem_write(origin+part*stride+60+row, b'AB\x01')
            old = [bytes(uc.mem_read(origin, len(seed))) for origin in (live, shadow)]
            uc.reg_write(a0, first); uc.reg_write(d0, track); uc.reg_write(d1, 1)
            run('ab_sig_write')
            assert old == [bytes(uc.mem_read(origin, len(seed))) for origin in (live, shadow)], 'reselect changed patch'
    # Leaving for any other machine uses the same reset, while keeping its requested row.
    for machine in range(5):
        for origin in (live, shadow):
            uc.mem_write(origin, seed); uc.mem_write(origin+60, b'AB\x01')
        uc.reg_write(a0, live+0x22); uc.reg_write(a1, bank); uc.reg_write(d0, 0); uc.reg_write(d2, 0)
        uc.mem_write(0x460d5c30, struct.pack('>I', machine))
        run('ab_src_commit', 0x4005a61c)
        assert uc.reg_read(d1) == machine
        for origin in (live, shadow):
            assert bytes(uc.mem_read(origin+48, 6)) == defaults[:6]
            assert bytes(uc.mem_read(origin+480, 6)) == defaults[6:]
            assert bytes(uc.mem_read(origin+60, 3)) == bytes(3)
    # ANALOG BD is FLEX to stock: a change between the two is no machine change,
    # so stock keeps the engine's copy of the track. The active Part's track
    # takes the twelve bytes the Part receives; another Part's does not.
    drum = bytes(uc.mem_read(symbols['ab_defaults'], 12))
    engine, stale, engine_cases = 0x80000810, bytes([0xc3]) * 576, 0
    voices, playing = 0x800049d8, bytes([1]) * (8 * 168)
    assert len({drum, defaults}) == 2
    for hook, until in (('ab_main_commit', 0x40079822), ('ab_src_commit', 0x4005a61c), ('ab_src_commit2', 0x4005a856)):
        for part in range(4):
            for track in range(8):
                for active in (part, (part + 1) & 3):
                    for signature, row, values in ((b'AB\x01', 1, defaults), (b'AB\x01', 0, defaults),
                                                   (b'\0\0\0', 5, drum), (b'AB\x01', 5, None),
                                                   (b'\0\0\0', 1, None), (b'AX\x01', 1, None)):
                        for origin in (live, shadow):
                            raw = bytearray(seed)
                            raw[stride*part+60+30*track:stride*part+63+30*track] = signature
                            uc.mem_write(origin, bytes(raw))
                        uc.mem_write(0x100b14cf, bytes([active]))
                        uc.mem_write(engine, stale)
                        uc.mem_write(voices, playing)
                        uc.reg_write(a0, live+stride*part+0x22+track); uc.reg_write(a1, bank)
                        uc.reg_write(d0, stride*part); uc.reg_write(d1, track); uc.reg_write(d2, track)
                        uc.reg_write(d4, row); uc.mem_write(0x460d5c30, struct.pack('>I', row))
                        run(hook, until)
                        expected = bytearray(stale)
                        if values is not None and active == part:
                            expected[72*track:72*track+6] = values[:6]
                            expected[72*track+0x20:72*track+0x26] = values[6:]
                        assert bytes(uc.mem_read(engine, 576)) == bytes(expected), (hook, part, track, active, signature, row)
                        # Leaving also stops the FLEX voice the drum's trigs started.
                        voice = bytearray(playing)
                        if values is defaults and active == part:
                            voice[168*track] = 0
                        assert bytes(uc.mem_read(voices, len(playing))) == bytes(voice), (hook, part, track, active, signature, row, 'voice')
                        engine_cases += 1
    uc.mem_write(0x100b14cf, b'\0')
    report = {'schema': 1, 'candidateVersion': '0.1.6-experimental',
              'machineSourceSha256': hashlib.sha256((args.sdk/'modules/analog-bassdrum/machine.s').read_bytes()).hexdigest(),
              'runtimeSha256': hashlib.sha256((runtime/'runtime.bin').read_bytes()).hexdigest(),
              'chooserCases': len(results), 'parts': 4, 'tracks': 8, 'partCopies': 2,
              'reselectCases': 32, 'otherMachineRows': 5, 'registersAndStackPreserved': True,
              'unrelatedPartBytesPreserved': True, 'engineCopyCases': engine_cases,
              'engineCopyOnlyForActivePart': True, 'leavingStopsOnlyThatTrackVoice': True, 'physicalHardware': 'not tested'}
    args.output.write_text(json.dumps(report, indent=2)+'\n')
    print('PASS 512 native chooser cases, 32 reselections, five destination machines; both copies and ABI; '
          + str(engine_cases) + ' engine-copy cases')


if __name__ == '__main__':
    main()

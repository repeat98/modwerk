# SPDX-License-Identifier: GPL-3.0-or-later
"""Private pre-boot DSP record insertion, without duplicating stock payloads.

The boot shim copies each already-patched original upload to linked .bss
scratch, inserts bounded authored X/Y initialization records and preserves
the original terminator/trailer. Only authored records enter its packed blob.
Run before BOOT_CONTINUE; core-ot's later .bss clear may reclaim the scratch.
The final builder must check linked scratch ranges and the RAM-boot ceiling.
"""
import hashlib

UNCACHED = 0x08000000
POINTERS = {'A': (0x40001e8e, 0x400e2324), 'B': (0x40001ed4, 0x400f59ef)}
MAX_UPLOAD = 0x40000


def sha(data):
    return hashlib.sha256(data).hexdigest()


def roll(data):
    result = 0
    for byte in data:
        result = (result * 33 + byte) & 0xffffffff
    return result


def pack_zeros(data):
    """Smallest 128-byte literal/zero stream, with the existing exact decoder.

    A literal may contain zero bytes. Splitting every isolated zero adds run
    headers; choose complete run boundaries before emitting authored bytes.
    No backreferences, stock codec or record/resource transformations.
    """
    length = len(data)
    cost, runs = [0] * (length + 1), [0] * length
    for at in range(length - 1, -1, -1):
        best, zero = length * 2 + 1, True
        for count in range(1, min(128, length - at) + 1):
            zero = zero and data[at + count - 1] == 0
            size = 1 + (0 if zero else count) + cost[at + count]
            if size <= best:  # equal sizes use the longest deterministic run
                best, runs[at] = size, -count if zero else count
        cost[at] = best
    out, at = bytearray(), 0
    while at < length:
        run = runs[at]
        count = abs(run)
        out.append((0x80 if run < 0 else 0) | (count - 1))
        if run > 0:
            out.extend(data[at:at + count])
        at += count
    return bytes(out)


def unpack_zeros(packed, length):
    if not 0 < length <= MAX_UPLOAD:
        raise ValueError('Invalid authored boot record length')
    out, at = bytearray(), 0
    while at < len(packed):
        token = packed[at]
        at += 1
        count = (token & 127) + 1
        if len(out) + count > length:
            raise ValueError('Authored boot record exceeds output bound')
        if token & 128:
            out.extend(bytes(count))
        else:
            if at + count > len(packed):
                raise ValueError('Truncated authored boot record')
            out.extend(packed[at:at + count])
            at += count
    if len(out) != length:
        raise ValueError('Authored boot record length differs')
    return bytes(out)


def terminal(raw):
    """Skip optional boot headers, then preserve the first non-P/X/Y terminal.

    The final 3 directive terminates 1.40C uploads; it is not another prefix.
    Keep the independent Elekloader parser check in prepare as well.
    """
    at = 0
    for header in (3, 4):
        if at + 3 <= len(raw) and int.from_bytes(raw[at:at + 3], 'little') == header:
            if at + 6 > len(raw):
                raise ValueError('Truncated original DSP boot header')
            at += 6
    while at + 3 <= len(raw):
        space = int.from_bytes(raw[at:at + 3], 'little')
        if space > 2:
            return at
        if at + 9 > len(raw):
            break
        count = int.from_bytes(raw[at + 6:at + 9], 'little')
        if not count or at + 9 + count * 3 > len(raw):
            break
        at += 9 + count * 3
    raise ValueError('DSP upload has no complete original terminator')


def records_bytes(records, expected_ranges):
    actual = [(row['space'], row['address'], len(row['words'])) for row in records]
    if actual != expected_ranges:
        raise ValueError('Authored DSP boot records differ from the owned resource ledger')
    out = bytearray()
    for row in records:
        space = {'x': 1, 'y': 2}.get(row['space'])
        if space is None or not 0 <= row['address'] < 0x40000 or not 0 < len(row['words']) <= 4096 or \
                row['address'] + len(row['words']) > 0x40000 or any(type(w) is not int or not 0 <= w <= 0xffffff for w in row['words']):
            raise ValueError('Authored DSP boot record is outside its bounds')
        out.extend(b''.join(value.to_bytes(3, 'little') for value in (space, row['address'], len(row['words']), *row['words'])))
    return bytes(out)


def prepare(image, device, dsp, layout):
    """Return boot assembly, guarded pointer sites and hash-only receipt.

    No files or firmware are written. `layout` is the real private resident
    dsp_loader.recipe result. The returned source embeds only authored records.
    """
    from resident_dsp import boot_ranges, resource_ranges
    lines = ['        .section .boot,"ax"', '        .globl mw_resident_dsp_boot',
             'mw_resident_dsp_boot:', '        lea -48(%sp),%sp',
             '        movem.l %d0-%d7/%a0-%a3,(%sp)']
    blobs, sites, receipt, scratch, pooled = [], [], [], [], []
    for tag in ('A', 'B'):
        pointer, address = POINTERS[tag]
        upload_at, upload_length = device.dsp_payloads[tag]
        if upload_at != address:
            raise ValueError('Original DSP upload address changed')
        offset = address - device.main_load
        raw = image[offset:offset + upload_length]
        if len(raw) != upload_length or len(raw) > MAX_UPLOAD:
            raise ValueError('Original DSP upload length is outside its bound')
        original_records = dsp.records(image, device, tag)  # independent upstream record parser
        term = terminal(raw)
        guard = image[pointer - device.main_load:pointer - device.main_load + 4]
        if guard != address.to_bytes(4, 'big'):
            raise ValueError('Original DSP upload pointer changed')
        # Zeroed Y ranges only: a packaged feature's words (Analog BD's X region) are its package's, written at its RESET.
        ranges = [(r['space'], r['address'], r['words']) for r in boot_ranges(tag) if r['space'] == 'y']
        for space, address_owned, words in ranges:
            if any(sp == {'x': 1, 'y': 2}[space] and lo < address_owned + words and address_owned < lo + count
                   for sp, lo, count, _ in original_records):
                raise ValueError('Authored DSP initialization overlaps an original loaded resource')
        records = layout[tag]['residentUploadRecords']
        authored = records_bytes(records, ranges)
        fragments = []
        for number, (row, owned) in enumerate(zip(records, ranges)):
            fragment = records_bytes([row], [owned])
            found = next((item for item in pooled if item['raw'] == fragment), None)
            if found is None:
                packed = pack_zeros(fragment)
                if unpack_zeros(packed, len(fragment)) != fragment:
                    raise ValueError('Authored boot records failed independent round trip')
                blob = 'mw_resident_records_%s_%d' % (tag, number)
                found = dict(raw=fragment, packed=packed, symbol=blob)
                pooled.append(found)
                blobs += ['        .balign 4', '        .globl ' + blob, blob + ':'] + [
                    '        .byte ' + ','.join('0x%02x' % b for b in packed[n:n + 24]) for n in range(0, len(packed), 24)] + [
                    '        .globl ' + blob + '_end', blob + '_end:']
            fragments.append(dict(symbol=found['symbol'], packedBytes=len(found['packed']), packedSha256=sha(found['packed']),
                                  authoredBytes=len(fragment), authoredSha256=sha(fragment), authoredRoll=roll(fragment)))
        total = len(raw) + len(authored)
        if total > MAX_UPLOAD:
            raise ValueError('Prepared DSP upload exceeds scratch ceiling')
        symbol = 'mw_resident_upload_' + tag
        lines += ['        lea 0x%x.l,%%a0' % address,
                  '        movea.l #%s+0x%x,%%a1' % (symbol, UNCACHED),
                  '        move.l #%d,%%d0' % term, '        bsr.w mw_resident_copy']
        for fragment in fragments:
            lines += ['        movea.l %a1,%a2', '        lea %s.l,%%a0' % fragment['symbol'],
                  '        move.l #%d,%%d0' % fragment['authoredBytes'], '        move.l #%d,%%d1' % fragment['packedBytes'],
                  '        bsr.w mw_resident_unpack',
                  '        move.l #%d,%%d0' % fragment['authoredBytes'], '        bsr.w mw_resident_hash',
                  '        cmpi.l #0x%x,%%d4' % fragment['authoredRoll'], '        bne.w mw_resident_fatal']
        lines += [
                  '        lea 0x%x.l,%%a0' % (address + term),
                  '        move.l #%d,%%d0' % (len(raw) - term), '        bsr.w mw_resident_copy']
        scratch += ['        .balign 32', '        .globl ' + symbol, symbol + ':', '        .skip %d' % total,
                    '        .globl ' + symbol + '_end', symbol + '_end:']
        sites.append(dict(addr=hex(pointer), stock=guard.hex(), op='ptr', target=symbol, addend=UNCACHED))
        receipt.append(dict(tag=tag, source=hex(address), originalBytes=len(raw), prefixBytes=term,
                            originalSha256=sha(raw), pointer=hex(pointer), pointerSha256=sha(guard),
                            authoredBytes=len(authored), authoredSha256=sha(authored), authoredRoll=roll(authored),
                            packedBytes=sum(f['packedBytes'] for f in fragments), packedFragments=fragments, scratchSymbol=symbol, scratchBytes=total,
                            records=[dict(space=s, address=hex(a), words=n, owner=next(r['owner'] for r in resource_ranges(tag)
                                     if r['space'] == s and r['address'] == a), originalLoadedOverlap=False) for s, a, n in ranges],
                            resident=layout[tag]['residentHooks']))
    lines += ['        movem.l (%sp),%d0-%d7/%a0-%a3', '        lea 48(%sp),%sp', '        rts',
              'mw_resident_copy:', '        tst.l %d0', '        beq.w mw_resident_copy_done',
              'mw_resident_copy_byte:', '        move.b (%a0)+,(%a1)+', '        subq.l #1,%d0',
              '        bne.w mw_resident_copy_byte', 'mw_resident_copy_done:', '        rts',
              'mw_resident_unpack:', '        tst.l %d0', '        beq.w mw_resident_unpack_done',
              '        tst.l %d1', '        beq.w mw_resident_fatal', '        moveq #0,%d3',
              '        move.b (%a0)+,%d3', '        subq.l #1,%d1', '        move.l %d3,%d2',
              '        andi.l #127,%d2', '        addq.l #1,%d2', '        cmp.l %d2,%d0',
              '        bcs.w mw_resident_fatal', '        sub.l %d2,%d0', '        btst #7,%d3',
              '        bne.w mw_resident_zero', '        cmp.l %d2,%d1', '        bcs.w mw_resident_fatal',
              '        sub.l %d2,%d1', 'mw_resident_literal:', '        move.b (%a0)+,(%a1)+',
              '        subq.l #1,%d2', '        bne.w mw_resident_literal', '        bra.w mw_resident_unpack',
              'mw_resident_zero:', '        clr.b (%a1)+', '        subq.l #1,%d2',
              '        bne.w mw_resident_zero', '        bra.w mw_resident_unpack',
              'mw_resident_unpack_done:', '        tst.l %d1', '        bne.w mw_resident_fatal', '        rts',
              'mw_resident_hash:', '        moveq #0,%d4', 'mw_resident_hash_byte:',
              '        move.l %d4,%d5', '        lsl.l #5,%d4', '        add.l %d5,%d4',
              '        moveq #0,%d5', '        move.b (%a2)+,%d5', '        add.l %d5,%d4',
              '        subq.l #1,%d0', '        bne.w mw_resident_hash_byte', '        rts',
              'mw_resident_fatal:', '        bra.w mw_resident_fatal']
    return dict(assembly='\n'.join(lines + blobs + ['        .section .bss'] + scratch) + '\n',
                sites=sites, receipt=receipt, packedUniqueBytes=sum(len(item['packed']) for item in pooled))


def check_linked(receipt, symbols, run, bss, boot=None):
    """Verify actual linked scratch and byte extents, never a guessed arena."""
    spans = []
    packed_spans = []
    if boot is not None and not boot[0] <= symbols['mw_resident_dsp_boot'] < boot[1]:
        raise ValueError('Resident DSP boot shim is outside linked .boot')
    for row in receipt:
        start, end = symbols[row['scratchSymbol']], symbols[row['scratchSymbol'] + '_end']
        if start % 32 or end - start != row['scratchBytes'] or not bss[0] <= start < end <= bss[1] or \
                start < run[1] and run[0] < end:
            raise ValueError('Resident DSP scratch is outside linked .bss')
        if any(start < hi and lo < end for lo, hi in spans):
            raise ValueError('Resident DSP scratch windows overlap')
        spans.append((start, end))
        if boot is not None:
            for fragment in row['packedFragments']:
                start, end = symbols[fragment['symbol']], symbols[fragment['symbol'] + '_end']
                identity = (fragment['symbol'], fragment['packedSha256'], fragment['authoredSha256'])
                if end - start != fragment['packedBytes'] or not boot[0] <= start < end <= boot[1] or \
                        any(start < hi and lo < end and (start, end, identity) != (lo, hi, prior)
                            for lo, hi, prior in packed_spans):
                    raise ValueError('Authored DSP records are outside linked .boot')
                packed_spans.append((start, end, identity))
    return spans

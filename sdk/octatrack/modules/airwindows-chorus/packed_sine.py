"""Losslessly pack the original Q23 sine's signed second differences.

The DSP starts at the known quarter-sine endpoint and advances its per-instance
pair of exact values one index at a time. Four signed six-bit differences fit
in each P word; no anchor/first-difference records or precision loss are needed.
"""
import math


def sine_values():
    return [round(math.sin(math.pi*i/2048)*((1<<23)-1)) for i in range(1025)] + [(1<<23)-1]


def packed_table():
    values = sine_values()
    corrections = [values[i]-2*values[i-1]+values[i-2] for i in range(2,len(values))]
    assert len(corrections) == 1024 and all(-32 <= v < 32 for v in corrections)
    return tuple(sum((corrections[start+i]&63) << (6*i) for i in range(4))
                 for start in range(0,1024,4))


def unpack_second(words,index):
    block,within = divmod(index-2,4)
    value = (words[block] >> (6*within)) & 63
    return value-64 if value&32 else value


if __name__ == '__main__':
    values,words = sine_values(),packed_table()
    for i in range(2,len(values)):
        assert unpack_second(words,i) == values[i]-2*values[i-1]+values[i-2]
    pair = [values[-2],values[-1]]
    for i in range(1023,-1,-1):
        delta = pair[1]-pair[0]-unpack_second(words,i+2)
        pair = [pair[0]-delta,pair[0]]
        assert pair == values[i:i+2]
    print('PASS: all 1026 original Q23 sine values are losslessly represented by 256 words')

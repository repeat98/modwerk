"""Float oracle transcribed from Chris Johnson's MIT-licensed ChorusProc.cpp.
Pinned original code is in upstream/. No denormal noise or floating-point
dither is added: the Octatrack's fixed-point arithmetic has neither.
"""
import math

SAMPLE_RATE = 44100
LOOP_LIMIT = int(16386 * 0.499)
RANGE = LOOP_LIMIT * 0.499

def knob(k):
    return 1.0 if k == 127 else k / 128.0

class Chorus:
    def __init__(self):
        self.buffers = [[0.0] * (16386) for _ in range(2)]
        self.previous = [0.0, 0.0]
        self.even = [0.0, 0.0]
        self.odd = [0.0, 0.0]
        self.phase = math.pi / 2
        self.flip = True
        self.count = 0

    def process(self, left, right, speed=64, range_=64, mix=64):
        rate = knob(speed)**4 * 0.001
        centre = knob(range_)**4 * RANGE
        wet = knob(mix)
        result = [[], []]
        for pair in zip(left, right):
            if self.count < 1 or self.count > LOOP_LIMIT:
                self.count = LOOP_LIMIT
            offset = centre + centre * wet * math.sin(self.phase)
            age = math.floor(offset)
            f = offset - age
            for channel, dry in enumerate(pair):
                delta = self.previous[channel] - dry
                if self.flip:
                    self.even[channel] += delta
                    self.odd[channel] -= delta
                    factor = self.even[channel]
                else:
                    self.odd[channel] += delta
                    self.even[channel] -= delta
                    factor = self.odd[channel]
                self.odd[channel] = (self.odd[channel] -
                    (self.odd[channel] - self.even[channel])/256) / 1.0001
                self.even[channel] = (self.even[channel] -
                    (self.even[channel] - self.odd[channel])/256) / 1.0001
                self.previous[channel] = dry
                buf = self.buffers[channel]
                buf[self.count] = buf[self.count+LOOP_LIMIT] = dry + factor * wet
                c = self.count + age
                s0, s1, s2 = buf[c:c+3]
                effect = (s0*(1-f) + s1 + s2*f -
                          ((s0-s1)-(s1-s2))/50) * 0.5
                result[channel].append(effect*wet + dry*(1-wet))
            self.count -= 1
            self.phase += rate
            if self.phase > 2*math.pi:
                self.phase -= 2*math.pi
            self.flip = not self.flip
        return result

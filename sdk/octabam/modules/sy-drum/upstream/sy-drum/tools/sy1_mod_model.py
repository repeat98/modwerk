#!/usr/bin/env python3
"""Independent floating-point oracle for the dedicated SY-1 LFO and S&H.

The LFO runs from an audio-frame clock regardless of voice activity. OFF/TRI
captures TRI and SQR captures the comparator waveform. SH has its own fixed
gain, independent of DEPTH. Its switch retains held voltage until the next
OFF trigger samples ground. SQ is negative while TRI rises and positive while
it falls, following the relaxation oscillator's comparator polarity.

An extension of the original circuit (30 Sep 2026): RND without SH is a uniform
stepped random wave, changing once per LFO cycle. RND with SH draws a fresh independent value
at every trigger and suppresses continuous random modulation; SPEED therefore
cannot change its held pitch between triggers. Switching SH off resumes the
rate-clocked random contribution; the prior held offset clears on the next
trigger. All other modes add continuous and held contributions as before.

U12: the .4..50 Hz clone-inspired range was extended to 100 Hz (1 Oct 2026) and
then to 200 Hz (3 Oct 2026). Raw 0..64 retains its original rates, and 65..127 rises exponentially
from that knee (4.56 Hz) to 200 Hz.
Original Pearl endpoints and voltage gains are unmeasured. Nominal TRI/SQ/SH full scale is independently +/-2 octaves. DEPTH
is normalized linear pending measurement of the original 100kA pot taper.

`render(page, seconds, settings, initial_phase=0, first_clock_frame=1)` uses raw
setup bytes SPEED/DEPTH/WAVE/SH. WAVE is 0 OFF, 1 TRI, 2 SQ, 3 RND. The default first
clock value matches integration after po_tick increments CK_FRAMES. Supplying
initial_phase represents an oscillator that has already run while silent.
"""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
import importlib.util
import math
import numpy as np

_spec = importlib.util.spec_from_file_location('sy1_base_oracle', Path(__file__).with_name('sy1_model.py'))
base = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(base)

RATE_MIN_HZ, RATE_MAX_HZ = .4, 200.
RATE_LEGACY_MAX_HZ, RATE_KNEE_RAW = 50., 64
TRI_RANGE_OCT, SQ_RANGE_OCT, SH_RANGE_OCT = 2., 2., 2.
DEPTH_EXPONENT = 1.
RANDOM_STEP = 0x9e3779b9


def mix32(value):
    """Bijective Murmur3 32-bit finalizer: uniform counter -> uniform bits."""
    value = ((value ^ (value >> 16)) * 0x85ebca6b) & 0xffffffff
    value = ((value ^ (value >> 13)) * 0xc2b2ae35) & 0xffffffff
    return value ^ (value >> 16)


def random_sample(counter):
    # Uniform signed Q16 values; no modulo reduction or rejection is needed.
    return ((mix32(counter) >> 15) - 65536) / 65536.



def clamp_byte(value):
    return min(127, max(0, int(value)))


def speed_hz(raw):
    raw = clamp_byte(raw)
    if raw <= RATE_KNEE_RAW:
        return RATE_MIN_HZ * (RATE_LEGACY_MAX_HZ/RATE_MIN_HZ) ** (raw/127)
    knee_hz = RATE_MIN_HZ * (RATE_LEGACY_MAX_HZ/RATE_MIN_HZ) ** (RATE_KNEE_RAW/127)
    return knee_hz * (RATE_MAX_HZ/knee_hz) ** ((raw-RATE_KNEE_RAW)/(127-RATE_KNEE_RAW))


@dataclass
class Modulator:
    phase: float = 0.
    last_frame: int = 0
    triangle: float = -1.
    held: float = 0.
    continuous: float = 0.
    track: int = 0
    continuous_counter: int | None = None
    trigger_counter: int | None = None

    def __post_init__(self):
        if self.continuous_counter is None:
            self.continuous_counter = mix32(0x53593100 + 2*self.track)
        if self.trigger_counter is None:
            self.trigger_counter = mix32(0x53593101 + 2*self.track)

    def tick(self, frame, settings, sr=44100):
        elapsed = (int(frame)-self.last_frame) & 0xffffffff
        unwrapped = self.phase + elapsed*base.FRAME/sr*speed_hz(settings.get('SPEED',0))
        # Snap roundoff at exact cycle edges before counting random periods.
        if abs(unwrapped-round(unwrapped)) < 1e-12:
            unwrapped = float(round(unwrapped))
        cycles = math.floor(unwrapped)
        self.phase = unwrapped % 1.
        self.continuous_counter = (self.continuous_counter + cycles*RANDOM_STEP) & 0xffffffff
        # Floating accumulation can place an exact square edge at 1-epsilon
        # (a rate that divides the control rate returns to phase zero exactly). Snap only
        # machine-roundoff distances, far below fixed-point phase resolution.
        if self.phase < 1e-12 or self.phase > 1-1e-12:
            self.phase = 0.
        elif abs(self.phase-.5) < 1e-12:
            self.phase = .5
        self.last_frame = int(frame) & 0xffffffff
        self.triangle = base.tri(self.phase)
        depth = (clamp_byte(settings.get('DEPTH',0))/127) ** DEPTH_EXPONENT
        wave = int(settings.get('WAVE',0))
        if wave == 1:
            self.continuous = self.triangle * depth * TRI_RANGE_OCT
        elif wave == 2:
            self.continuous = (-1. if self.phase < .5 else 1.) * depth * SQ_RANGE_OCT
        elif wave == 3 and not settings.get('SH',0):
            self.continuous = random_sample(self.continuous_counter) * depth * TRI_RANGE_OCT
        else:
            self.continuous = 0.
        return self.offset(settings)

    def trigger(self, settings):
        if not settings.get('SH',0):
            self.held = 0.
        elif int(settings.get('WAVE',0)) == 3:
            self.trigger_counter = (self.trigger_counter + RANDOM_STEP) & 0xffffffff
            self.held = random_sample(self.trigger_counter)
            self.continuous = 0.
        elif int(settings.get('WAVE',0)) == 2:
            self.held = -1. if self.phase < .5 else 1.
        else:
            self.held = base.tri(self.phase)
        return self.offset(settings)

    def offset(self, settings):
        return self.continuous + self.held*SH_RANGE_OCT


def render(page, seconds, settings, sr=44100, initial_phase=0., first_clock_frame=1):
    """Render one channel; settings can also be callable(frame)->raw byte dict."""
    ptch = int(page.get('PTCH',64)); mode = min(max(int(page.get('MODE',0)),0),5)
    wdth = int(page.get('WDTH',64)); swep = int(page.get('SWEP',64))
    sped = int(page.get('SPED',64)); dec = int(page.get('DEC',64))
    triggers = set(int(round(t*sr))//base.FRAME for t in page.get('trigs',[0.]))
    n = int(round(seconds*sr)); frames = (n+base.FRAME-1)//base.FRAME
    result = np.zeros(frames*base.FRAME)
    noise = base.lcg_noise(len(result)) if mode == 5 else None
    note_oct = (ptch-64)/12.
    start_oct = -(swep-64)*base.SWEEP_SEMI/12.
    k1 = np.exp(-base.FRAME/(sr*base.tau_sweep(sped)))
    e1 = e2 = ph1 = ph2 = y1 = y2 = 0.
    inc1 = inc2 = amp = g1 = g2 = 0.
    mod = Modulator(phase=initial_phase)
    for fr in range(frames):
        controls = settings(fr) if callable(settings) else settings
        mod.tick((first_clock_frame+fr)&0xffffffff, controls, sr)
        if fr in triggers:
            e1 = e2 = 1.
            mod.trigger(controls)
        else:
            e1 *= k1
            e2 *= np.exp(-base.FRAME/(sr*base.tau_decay(dec,base.C4*2**cv_bus))) if fr else 1.
        tuned_note = note_oct + mod.offset(controls)
        sweep = start_oct * e1
        cv_bus = tuned_note + sweep
        cv2 = tuned_note + base.OFF2_OCT
        if mode in (2,3,4): cv2 += base.C_OFF2_OCT
        if mode != 3: cv2 += sweep
        cv1 = cv_bus
        if mode == 3:
            cv2 += base.D_OCT*e2
            if base.D_EG2_BOTH: cv1 += base.D_OCT*e2
        f1 = base.clamp_f(base.C4*2**cv1,sr)
        f2 = base.clamp_f(base.C4*2**cv2,sr)
        if mode == 4: f2 = base.clamp_f(f2*2*base.N_RISE/(base.N_RISE+1),sr)
        cv_filter = cv_bus + base.WIDTH_OCT*wdth/127*e2 + (base.E_VCF_OCT if mode==4 else 0)
        close = base.CLOSE_OCT*(1-wdth/127)
        t_g1 = base.lp_coef(base.F1_0*2**(cv_filter-close),sr)
        t_g2 = base.lp_coef(base.POLE_RATIO*base.F1_0*2**(base.CV_RATIO*cv_filter-close),sr)
        t_inc1,t_inc2,t_amp = f1/sr,f2/sr,e2
        if fr == 0: inc1,inc2,amp,g1,g2 = t_inc1,t_inc2,t_amp,t_g1,t_g2
        for i in range(base.FRAME):
            a = (i+1)/base.FRAME
            ci1 = inc1+(t_inc1-inc1)*a; ci2 = inc2+(t_inc2-inc2)*a
            ca = amp+(t_amp-amp)*a; cg1 = g1+(t_g1-g1)*a; cg2 = g2+(t_g2-g2)*a
            ph1 = (ph1+ci1)%1; w1 = base.tri(ph1)
            if mode in (1,4): ci2 = min(ci2*2**(base.FM_OCT*w1),base.F_MAX_CYC)
            ph2 = (ph2+ci2)%1
            if mode == 0: x = w1
            elif mode == 1: x = base.tri(ph2)
            elif mode == 2: x = (base.C_MIX1*w1+base.tri(ph2))/(1+base.C_MIX1)
            elif mode == 3: x = .5*(w1+base.tri(ph2))
            elif mode == 4: x = base.pseudo_saw(ph2)
            else: x = noise[fr*base.FRAME+i]
            y1 += cg1*(x-y1); y2 += cg2*(y1-y2)
            result[fr*base.FRAME+i] = y2*ca
        inc1,inc2,amp,g1,g2 = t_inc1,t_inc2,t_amp,t_g1,t_g2
    return result[:n]


if __name__ == '__main__':
    page = dict(PTCH=64,MODE=0,WDTH=127,SWEP=64,SPED=64,DEC=127)
    dry = base.render(page,.1)
    off = render(page,.1,dict(SPEED=127,DEPTH=127,WAVE=0,SH=0))
    assert np.array_equal(dry,off), 'Disabled dedicated modulation changed the base float oracle'
    m = Modulator()
    c = dict(SPEED=64,DEPTH=0,WAVE=0,SH=1)
    m.tick(100,c); held=m.trigger(c)
    m.tick(110,c)
    assert m.offset(c)==held and held!=0, 'S&H must work independently of WAVE/DEPTH'
    c['SH']=0
    m.tick(120,c)
    assert m.offset(c)==held, 'SH OFF must retain the stored capacitor voltage'
    m.trigger(c)
    assert m.offset(c)==0., 'The next OFF trigger samples ground'
    c = dict(SPEED=127,DEPTH=127,WAVE=2,SH=1)
    m.phase = .25
    assert m.trigger(c) - m.continuous == -SH_RANGE_OCT
    c['WAVE'] = 3
    m.tick(121,c)
    first = m.trigger(c)
    assert m.continuous == 0.
    m.tick(10000,c)
    assert m.offset(c) == first
    assert m.trigger(c) != first
    print('Float oracle: disabled exact; selected TRI/SQ capture; random SH holds independent of SPEED and redraws on every trigger.')

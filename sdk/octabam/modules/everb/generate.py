#!/usr/bin/env python3
"""Generate everb.asm, the E-Verb DSP56300 source, from its design constants.

    python3 generate.py            # print the source
    python3 generate.py --write    # rewrite everb.asm beside this file
    python3 generate.py --check    # exit 1 unless everb.asm is exactly what this prints

everb.asm is committed and is what the builder assembles; this script is how
it was written. The module's gate (verify.py) runs --check, so the two cannot
drift. Original code (MIT, see LICENSE); the design follows Tom Erbe's ICMC
2015 paper (CC BY 3.0), credited in README.md.
"""
import math
import pathlib
import sys

# ---- design constants, layout and emit helpers ----------------------------------
FT = 22050.0                      # tank rate
L = [3163, 2659, 2237, 1889]      # line maxima at SIZE 127 (primes), tank samples
A = [281, 239, 199, 163]          # in-loop allpass maxima at SIZE 127 (primes)
PRE = 5512                        # 250 ms
HB = [0.160421, 0.496365, 0.830509]   # interpolator: elliptic halfband n=3 (39 dB from 13 kHz): path 0 = c0, c2; path 1 = c1
HD = [0.287369, 0.765357]             # decimator: n=2 (31 dB from 14 kHz): path 0 = c0, path 1 = c1
EXP = [0.99988026, 0.69016736, 0.2276436, 0.03729821]  # 2^v, v in [-1.125, 0]
SINP = [1.5703367802258712, -0.6421070455330973, 0.07177026530722608]
CLP_MIN = 0.07
INJ = 0.5                         # tank input gain
ER_G = 0.5                        # early-reflection tap gain
RDC = 1 - 2 * math.pi * 6 / FT       # in-loop DC blockers, lines 0 and 1
RDCIN = 1 - 2 * math.pi * 10 / FT    # input DC blocker
KTLO = 1 - math.exp(-2 * math.pi * 250 / FT)     # tilt: low shelf corner
_K = math.tan(math.pi * 2000 / FT)                # tilt: high shelf corner, bilinear high-pass
THG = 1 / (1 + _K)
THC = (1 - _K) / (1 + _K)
KENV = 1.0 / 1024
PRE_OCT = math.log2(PRE / 154.0)
W_MIN = 926
U_WMIN = math.log2(W_MIN / 154.0) / PRE_OCT
ONE = 0.99999988


def q23(xv):
    v = int(round(xv * 8388608.0))
    v = max(-0x800000, min(0x7fffff, v))
    return v & 0xffffff


def hx(v):
    return '$%06x' % (v & 0xffffff)


def fq(xv):
    return hx(q23(xv))


seg = {}
off = 0
for name, maxd in [('pre', PRE)] + [('ap%d' % i, a) for i, a in enumerate(A)] + [('ln%d' % i, l) for i, l in enumerate(L)]:
    seg[name] = off
    off -= maxd + 3
RING_USED = -off
assert RING_USED <= 16384

X = {}
def xa(name, addr):
    assert name not in X, name
    assert addr not in X.values(), (name, hex(addr))
    assert 0 <= addr <= 0x83, (name, hex(addr))
    X[name] = addr
LAYOUT = [
    # scalars
    'base', 'head', 'clr', 'ph', 'frac', 'gp', 'dp', 'jprev', 'rng', 'sigt', 'tau4', 'omw', 'grp', 'us',
    # A input stream: decimator path 0, path 1 output, d, then the six frame values
    'dz0', 'dz1', 'p1', 'd', 'fv0', 'fv1', 'fv2', 'fv3', 'fv4', 'fv5', 'fv6',
    # A pairs (value, delta)
    'v_S', 'd_S', 'v_G', 'd_G', 'v_clp', 'd_clp', 'v_c2', 'd_c2', 'v_e', 'd_e',
    # cyclic oscillator
    'kosc', 'sx', 'cy',
    # per-line arrays (indexed by the line in its quarter: below 64)
    'ct0', 'ct1', 'ct2', 'ct3', 'rnew0', 'rnew1', 'rnew2', 'rnew3', 'rold0', 'rold1', 'rold2', 'rold3',
    'yv0', 'yv1', 'yv2', 'yv3', 'lw0', 'lw1', 'lw2', 'lw3', 'll0', 'll1', 'll2', 'll3',
    # from 64
    'er0', 'g0', 'er1', 'er2', 'g2', 'er3', 'lp0', 'lp1', 'lp2', 'lp3',
    'dc0', 'dcx0', 'dce0', 'dc1', 'dcx1', 'dce1', 'f0', 'f1', 'f2', 'f3', 'sL', 'sR',
    # B
    'dw0', 'dw1',
    'v_gap', 'd_gap', 'v_prel', 'd_prel', 'v_t0', 'd_t0', 'v_t1', 'd_t1', 'v_t2', 'd_t2', 'v_dk', 'd_dk',
    'dcin', 'dcinx', 'dcine', 'wL', 'wR',
    'tlL', 'txL', 'thL', 'tlR', 'txR', 'thR',
    'iL0', 'iL1', 'iL2', 'iR0', 'iR1', 'iR2',
    'jL0', 'jL1', 'jR0', 'jR1',
    'v_dgm1', 'd_dgm1', 'rho', 'drho', 'rmode', 'env', 't_S', 'u_S',
]
for i, n in enumerate(LAYOUT):
    xa(n, i)
nxt = len(LAYOUT)
PARAMS = ['S', 'G', 'clp', 'c2', 'e', 'gap', 'prel', 't0', 't1', 't2', 'dgm1', 'dk']
# B-arm and per-call temporaries share A-only words
TEMPS = {'ap0': 'ct0', 'ap1': 'ct1', 'ap2': 'ct2', 'ap3': 'ct3', 'q': 'g0', 'rA': 'er0', 'rB': 'er1', 'rw': 'er2',
         'edcy': 'yv0', 'esiz': 'yv1', 'envn': 'yv2', 'tt': 'yv3', 'tm': 'er0', 'tc': 'er1', 'tS': 'er2'}
LAST = nxt - 1
assert nxt <= 0x84, hex(nxt)
assert X['ll3'] < 0x40 and X['yv3'] < 0x40


def addr(name):
    return X[TEMPS.get(name, name)]


INLOOP = [False]


def m(name):
    a = addr(name)
    if INLOOP[0] and a >= 0x40:
        return 'x:(r6+$%x)' % (a - 0x40)
    return 'x:(r7+$%x)' % a


def mi(name):
    """indexed: r2 = r7 + j"""
    a = addr(name)
    assert 0 <= a <= 63, name
    return 'x:(r2+$%x)' % a


def X_(name):
    a = addr(name)
    return 'x:(r7+$%x)' % a if a < 0x40 else 'x:(r6+$%x)' % (a - 0x40)


def LUA(name, reg):
    a = addr(name)
    if a < 0x40:
        return 'lua     (r7+$%x),%s' % (a, reg)
    assert INLOOP[0], ('outside the loop r6 is the knob pointer', name)
    return 'lua     (r6+$%x),%s' % (a - 0x40, reg)


out = []
def e(s=''):
    out.append(s)


def mv(src, dst, comment=''):
    e(('        move    %-24s%s' % (src + ',' + dst, ('; ' + comment) if comment else '')).rstrip())


def ins(op, args='', comment=''):
    e(('        %-8s%-24s%s' % (op, args, ('; ' + comment) if comment else '')).rstrip())


def lab(n):
    e(n + ':')


def L_(s):
    """emit a raw line (already formatted)."""
    out.append(s)


def op(mn, args='', par='', comment=''):
    text = '        %-8s%-14s%s' % (mn, args, ('  ' + par) if par else '')
    if comment:
        text = '%-48s; %s' % (text, comment)
    out.append(text.rstrip())


def imm(v):
    return '#>%s' % (fq(v) if isinstance(v, float) else hx(v))


ONEQ = ONE
HALF_SAT = (0.375 / 8, 0.125 / 8)       # the saturator stores s/8: the matrix then yields f/4, the allpasses' quarter scale


def interp_read(P, Q, comment=''):
    """P1:P0 = ring offset (integer:fraction), Q >= 0 holds a value with Q2 = 0.
    -> P = linear interpolation. Clobbers Q, x0, y0, y1, n5, r4."""
    op('move', '%s1,n5' % P)
    op('move', '%s0,%s1' % (P, Q), comment='the fraction into a clean accumulator')
    op('lua', '(r5+n5),r4')
    op('lsr', Q, 'y:(r4)+,y1', 'psi ; s0')
    op('move', '%s,x0' % Q, 'y:(r4),y0', 'psi ; s1')
    op('mpy', 'y0,x0,%s' % P)
    op('mac', '-x0,y1,%s' % P)
    op('add', 'y1,%s' % P, comment=comment or 's0 + psi (s1 - s0)')


# ---- header, init ---------------------------------------------------------------
M_WET = 3.5                       # wet makeup before tilt


def tilt_scale():
    return M_WET / 64.0


# =====================================================================================
e('; CYCLES_FORWARD_BRANCHES')
e('; E-Verb (everb): a four-line modulated feedback delay network reverb for FX2,')
e('; written from Tom Erbe, "Building the Erbe-Verb: Extending the Feedback Delay')
e('; Network Reverb for Modular Synthesizer Use", ICMC 2015 (CC BY 3.0). Original')
e('; implementation; no code, constants or tables from any other reverb.')
e('; Generated by generate.py in this folder; edit that file, not this one.')
e(';')
e('; Per frame pair (44.1 kHz): L+R -> elliptic halfband decimator -> one tank tick at')
e('; 22.05 kHz -> halfband interpolator -> equal-power mix with the untouched dry')
e('; frames. Tank tick: pre-delay or reverse -> four lines, each an in-loop allpass')
e('; (diffusion) into a modulated delay, absorb low-pass, decay gain and cubic')
e('; saturation, into a 4x4 Hadamard matrix and back. Taps: line outputs and the')
e('; allpass outputs (early reflections), then three-band tilt and wet gain.')
e('; Even frames (A) read the tank, odd frames (B) write it: the two arms are a')
e('; MODEFORK, so cycle_count.py prices each frame at the dearer arm.')
e(';')
e('; Ring: the 16K Y allocator buffer, one head r5 (m5 = 16383), segments below it:')
for k, v in seg.items():
    e(';   %-5s writes at r5%+6d' % (k, v))
e(';   %d of 16384 words.' % RING_USED)
e('; X block r7+0..%d, every word cleared by init:' % LAST)
row = ''
for k, v in sorted(X.items(), key=lambda kv: kv[1]):
    item = '%d %s' % (v, k)
    if len(row) + len(item) > 72:
        e(';   ' + row.rstrip(' ,'))
        row = ''
    row += item + ', '
if row:
    e(';   ' + row.rstrip(' ,'))
e('')

# ---- init ---------------------------------------------------------------------------
lab('init')
mv('#>$ffffff', 'm4')
mv('r7', 'r4')
ins('clr', 'a')
ins('do', '#$84,>ev_izro')
mv('a', 'x:(r4)+')
lab('ev_izro')
ins('nop')
mv('x:>$213', 'r4', "this instance's allocator entry")
mv('x:(r4)', 'a')
mv('a', m('base'))
mv('a', m('head'))
mv('#>$80', 'a', '128 calls of 128 words clear the ring')
mv('a', m('clr'))
mv('#>%s' % fq(0.95), 'a', 'quadrature oscillator amplitude')
mv('a', m('cy'))
mv('#>$5a5a5b', 'a', 'grain generator seed')
mv('a', m('rng'))
mv('#>%s' % fq(ONE), 'a', 'the reverse duck starts open')
mv('a', m('v_dk'))
for i in range(4):
    mv('#>%s' % hx(seg['ln%d' % i]), 'a', 'line %d write offset' % i)
    mv('a', m('lw%d' % i))
    mv('#>%s' % hx(-L[i]), 'a', '-%d' % L[i])
    mv('a', m('ll%d' % i))
ins('rts')
e('')

# ---- proc entry: ring clearing, re-base, knob targets --------------------------
# Clearing, re-basing the smoothed values, then one knob group per main call.

def K_(k):
    return 'x:(r6+$%x)' % k if k else 'x:(r6)'


def upd(p, snap=False):
    """b = target; v_p is current (re-based): d_p = (t - v)/8, or with snap land on t
    when within 2^-13. One shared subroutine (ev_upd, ev_usn), v_p's offset in n1."""
    assert addr('d_' + p) == addr('v_' + p) + 1, p
    op('move', '#>$%x,n1' % addr('v_' + p))
    op('bsr', 'ev_usn' if snap else 'ev_upd')


def ku(src, field='p1'):
    """a = knob/127 (Q23); also x0 = raw v/128."""
    if field == 'p1':
        op('move', '%s,x0' % src)
    else:
        op('move', '%s,a' % src)
        if field == 'hi':
            op('and', '#>$ff0000,a')
        else:
            op('and', '#>$00ff00,a')
            op('asl', '#$8,a,a')
        op('move', 'a1,x0')
    op('mpyi', '%s,x0,a' % imm(64.0 / 127.0))
    op('asl', 'a', comment='v/127')


def kt(src, field='p1'):
    """x0 = (v - 64)/63 limited to [-1, 1), a = the same."""
    if field == 'p1':
        op('move', '%s,a' % src)
    else:
        op('move', '%s,a' % src)
        if field == 'hi':
            op('and', '#>$ff0000,a')
        else:
            op('and', '#>$00ff00,a')
            op('asl', '#$8,a,a')
        op('move', 'a1,x0')
        op('tfr', 'x0,a')
    op('sub', '#>$400000,a', comment='v/128 - 1/2')
    op('move', 'a,x0')
    op('mpyi', '%s,x0,a' % imm(128.0 / 63.0 / 4.0))
    op('asl', '#$2,a,a')
    op('move', 'a,x0', comment='t, limited')
    op('tfr', 'x0,a')


def ex2(sq):
    """a = v in [-1.125, 0] -> a = (2^v)^(2^sq), sq 2 or 3. Clobbers x0, y0."""
    assert sq in (2, 3), sq
    op('bsr', 'ev_exq')
    if sq == 3:
        op('move', 'a,x0')
        op('mpy', 'x0,x0,a')


def sinq():
    """a = m in [0,1] -> a = sin(pi m/2). Clobbers x0, x1, y0."""
    op('bsr', 'ev_sin')


lab('proc')
op('move', 'a1,y0', comment="the dispatcher's flag: nonzero for a block's main call, 0 for a split sub-call")
L_('; Bounded clearing, 128 words per call: dry until the ring is clean.')
op('move', '%s,a' % m('clr'))
op('tst', 'a')
op('beq', 'ev_ready')
op('sub', '#$1,a')
op('move', 'a,%s' % m('clr'))
op('asl', '#$7,a,a')
op('move', '%s,x0' % m('base'))
op('add', 'x0,a')
op('move', 'a,r4')
op('move', '#>$ffffff,m4')
op('clr', 'a')
op('do', '#128,>ev_clrd')
op('move', 'a,y:(r4)+')
lab('ev_clrd')
op('nop')
op('rts')
lab('ev_ready')
L_('; Smoothed values run v + delta*frac through a call (frac +1/32 per frame). Each call')
L_('; moves v to where the last one stopped; a main call then reads one of four knob')
L_('; groups and sets those deltas to (target - v)/8. Values glide continuously, split')
L_('; calls included, and every slope is refreshed every fourth block.')
op('move', '#>$ffffff,m1')
op('move', '#>$ffffff,m2')
op('move', '%s,y1' % m('frac'))
op('clr', 'a')
op('move', 'a,%s' % m('frac'))
op('move', '#>$2,n2')
for first, count in (('v_S', 5), ('v_gap', 6), ('v_dgm1', 1)):
    if addr(first) < 0x40:
        op(*LUA(first, 'r1').split(None, 1))
        op(*LUA(first, 'r2').split(None, 1))
    else:
        op('move', 'r7,r1')
        op('move', '#>$%x,n1' % addr(first))
        op('lua', '(r1+n1),r1')
        op('move', 'r1,r2')
    for k in range(count):
        acc, oth = ('a', 'b') if k % 2 == 0 else ('b', 'a')
        if k == 0:
            op('move', 'x:(r1)+,%s' % acc)
        op('move', 'x:(r1)+,x0')
        if k < count - 1:
            op('mac', 'x0,y1,%s' % acc, 'x:(r1)+,%s' % oth)
        else:
            op('mac', 'x0,y1,%s' % acc)
        op('move', '%s,x:(r2)+n2' % acc)
L_('; SIZE glides every delay, so its own glide is second order: u follows the target')
L_('; and the slope follows u, both on every call. A slope that changed only every fourth')
L_('; block would step the pitch of every line there (a block-rate zipper while SIZE moves).')
op('move', '%s,a' % m('u_S'))
op('move', '%s,b' % m('t_S'))
op('sub', 'a,b')
op('asr', '#$3,b,b')
op('add', 'b,a', comment='u += (t - u)/8')
op('move', 'a,%s' % m('u_S'))
op('tfr', 'a,b')
op('move', '%s,a' % m('v_S'))
op('sub', 'a,b')
op('asr', '#$3,b,b')
op('move', 'b,%s' % m('d_S'), comment='slope (u - v)/8')
op('tfr', 'y0,a')
op('tst', 'a')
op('beq', 'ev_loop', comment='a split sub-call continues the ramps')
op('move', '%s,a' % m('grp'))
op('add', '#$1,a')
op('and', '#>$000003,a')
op('move', 'a1,%s' % m('grp'))
op('move', 'a1,x0')
op('tfr', 'x0,a')
op('tst', 'a')
op('beq', 'ev_gr0')
op('cmp', '#$1,a')
op('beq', 'ev_gr1')
op('cmp', '#$2,a')
op('beq', 'ev_gr2')
op('bra', 'ev_gr3')

# ---- group 0: SIZE, DCY (each with its envelope amount) ------------------------------
lab('ev_gr0')
L_('; envelope amounts: EDCY (slot 9), ESIZ (slot 10); envn = min(1, 4 env)')
op('move', '%s,a' % m('env'))
op('asl', '#$2,a,a')
op('move', 'a,y1', comment='envn, limited')
kt('x:(r6+$e)', 'hi')
op('mpy', 'x0,y1,b', comment='ESIZ env')
op('move', 'b,%s' % m('tt'))
kt('x:(r6+$d)', 'lo')
op('mpy', 'x0,y1,b', comment='EDCY env')
op('move', 'b,%s' % m('tm'))
L_('; SIZE (slot 0): u + ESIZ env in [0,1] -> S = 2^(-6(1-u)), six octaves')
ku(K_(0))
op('move', '%s,x0' % m('tt'))
op('add', 'x0,a')
op('tst', 'a')
op('bge', 'ev_szlo')
op('clr', 'a')
lab('ev_szlo')
op('move', 'a,x0', comment='u, limited at 1')
op('move', 'x0,%s' % m('us'))
op('mpyi', '%s,x0,a' % imm(0.75))
op('sub', '%s,a' % imm(0.75), comment='v = 0.75u - 0.75')
ex2(3)
op('tfr', 'a,b')
op('move', 'b,%s' % m('t_S'), comment='the target; every call glides toward it')
L_('; DCY (slot 1): u + EDCY env; g = 1 - (1 - 1.2u)^2 to 100% at u = 5/6, then 1.2u')
L_('; to 120%; G = 2g/3 drives the saturator')
ku(K_(1))
L_('; EDCY may lengthen the decay up to u = 0.75 (DCY 95, g = 0.99) but never into the')
L_('; sustain zone: only DCY itself goes there. u = min(u + EDCY env, max(u, 0.75))')
op('tfr', 'a,b')
op('move', '%s,x0' % imm(0.75))
op('cmp', 'x0,b')
op('tlt', 'x0,b', comment='max(u, 0.75)')
op('move', 'b,y1')
op('move', '%s,x0' % m('tm'))
op('add', 'x0,a', comment='u + EDCY env')
op('cmp', 'y1,a')
op('tge', 'y1,a')
op('tst', 'a')
op('bge', 'ev_dclo')
op('clr', 'a')
lab('ev_dclo')
op('move', 'a,x0', comment='u, limited at 1')
op('mpyi', '%s,x0,b' % imm(0.8), comment='G = 0.8u, the sustain zone')
op('mpyi', '%s,x0,a' % imm(0.6))
op('asl', 'a', comment='1.2u')
op('cmp', '%s,a' % imm(ONE))
op('bge', 'ev_dcsz')
op('neg', 'a')
op('add', '%s,a' % imm(ONE))
op('move', 'a,x0')
op('mpy', 'x0,x0,a')
op('neg', 'a')
op('add', '%s,a' % imm(ONE), comment='g')
op('move', 'a,x0')
op('mpyi', '%s,x0,b' % imm(2.0 / 3.0))
lab('ev_dcsz')
upd('G')
op('bra', 'ev_loop')

# ---- group 1: ABSB, DPTH, SPD ----------------------------------------------------------
lab('ev_gr1')
L_('; ABSB (slot 2): diffusion 0..0.8 up to 0.3, then damping d = (u-0.3)/0.7,')
L_('; absorb clp = 0.07 + 0.93 (1-d)^2')
ku(K_(2))
op('move', 'a,%s' % m('tt'))
op('move', 'a,x0')
op('mpyi', '%s,x0,b' % imm(0.8 / 0.3 / 4.0))
op('asl', '#$2,b,b')
op('move', '%s,y1' % imm(0.8))
op('cmp', 'y1,b')
op('tge', 'y1,b')
upd('gap')
op('move', '%s,a' % m('tt'))
op('sub', '%s,a' % imm(0.3))
op('tst', 'a')
op('bge', 'ev_dmlo')
op('clr', 'a')
lab('ev_dmlo')
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(1.0 / 0.7 / 2.0))
op('asl', 'a', comment='d')
op('neg', 'a')
op('add', '%s,a' % imm(ONE))
op('move', 'a,x0')
op('mpy', 'x0,x0,a', comment='(1-d)^2')
op('move', 'a,x0')
op('mpyi', '%s,x0,b' % imm(1 - CLP_MIN))
op('add', '%s,b' % imm(CLP_MIN))
upd('clp')
L_('; DPTH (slot 3), t: below 0 cyclic c = 0.9 t^2; to 0.75 ergodic e = 0.9 (t/0.75)^2;')
L_('; above, shimmer s = (t-0.75)/0.25 of the grains glide up an octave, e = 0.9 (1-s)')
kt(K_(3))
op('move', 'a,%s' % m('tt'))
op('clr', 'b')
op('tst', 'a')
op('bge', 'ev_cyc0')
op('mpyi', '%s,x0,a' % imm(0.45))
op('move', 'a,y0')
op('mpy', 'y0,x0,b', comment='c/2 = 0.45 t^2')
lab('ev_cyc0')
upd('c2', snap=True)
op('move', '%s,a' % m('tt'))
op('clr', 'b')
op('move', 'b,%s' % m('sigt'))
op('tst', 'a')
op('ble', 'ev_erg0')
op('cmp', '%s,a' % imm(0.75))
op('bgt', 'ev_shim')
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(1.0 / 0.75 / 2.0))
op('asl', 'a')
op('move', 'a,x0', comment='t/0.75')
op('mpy', 'x0,x0,a')
op('move', 'a,x0')
op('mpyi', '%s,x0,b' % imm(0.9), comment='e')
op('bra', 'ev_erg0')
lab('ev_shim')
op('sub', '%s,a' % imm(0.75))
op('asl', '#$2,a,a')
op('move', 'a,x0', comment='s, limited at 1')
L_('; no new gliding grains until the cyclic depth has glided to exactly 0: a glide')
L_('; under a large cyclic offset would read ahead of its line')
op('move', '%s,b' % m('v_c2'))
op('tst', 'b')
op('bne', 'ev_sblk')
op('move', 'x0,%s' % m('sigt'))
lab('ev_sblk')
op('move', '%s,b' % imm(0.9))
op('mpyi', '%s,x0,a' % imm(0.9))
op('sub', 'a,b', comment='e = 0.9 (1 - s)')
lab('ev_erg0')
upd('e', snap=True)
L_('; SPD (slot 4): f = 0.5 Hz 2^(9u): cyclic rotation and grain phase step; in the')
L_('; shimmer zone the grain lasts 0.75 L2 S ticks instead (SIZE sets it)')
ku(K_(4))
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(1.125 / 2))
op('asl', 'a')
op('sub', '%s,a' % imm(1.125), comment='v = (9u-9)/8')
ex2(3)
op('move', 'a,x0', comment='f/256 Hz')
op('mpyi', '%s,x0,a' % imm(2 * math.pi * 256 / FT))
op('move', 'a,%s' % m('kosc'))
op('mpyi', '#>%d,x0,a' % round((1 << 24) * 256 / FT))
op('move', 'a1,%s' % m('dp'))
op('move', '%s,a' % m('sigt'))
op('tst', 'a')
op('beq', 'ev_loop')
op('move', '%s,x0' % m('us'))
op('mpyi', '%s,x0,a' % imm(-0.75))
ex2(3)
op('move', 'a,x0', comment='2^(-6u)')
op('mpyi', '#>%d,x0,a' % round((1 << 24) * 64 / (0.75 * L[2])))
op('move', 'a1,%s' % m('dp'))
op('bra', 'ev_loop')

# ---- group 2: PRE, the reverse rate, REV --------------------------------------------------
lab('ev_gr2')
L_('; PRE (slot 7): D = 154 * 2^(5.16u) samples (7..250 ms), as a fraction of 5512')
ku('x:(r6+$c)', 'lo')
op('move', 'a,%s' % m('tt'))
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(PRE_OCT / 8))
op('sub', '%s,a' % imm(PRE_OCT / 8))
ex2(3)
op('tfr', 'a,b')
upd('prel')
L_('; reverse heads advance 2/W of the window per tick: drho = 2^25/154 * 2^(-5.16 max(u, u42))')
op('move', '%s,a' % m('tt'))
op('move', '%s,x0' % imm(U_WMIN))
op('cmp', 'x0,a')
op('tlt', 'x0,a')
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(-PRE_OCT / 8))
ex2(3)
op('move', 'a,x0')
op('mpyi', '#>%d,x0,a' % round((1 << 25) / 154.0))
op('move', 'a1,%s' % m('drho'))
L_('; REV (slot 8): a change ducks the pre-delay output, switches at silence, reopens')
op('move', 'x:(r6+$d),a')
op('and', '#>$ff0000,a')
op('move', 'a1,x0')
op('tfr', 'x0,a')
op('tst', 'a')
op('move', '#>$1,x0')
op('tne', 'x0,a', comment='requested mode')
op('move', '%s,x0' % m('rmode'))
op('cmp', 'x0,a')
op('beq', 'ev_rvok')
op('move', 'a,x1')
op('move', '%s,b' % m('v_dk'))
op('cmp', '#>$002000,b')
op('bge', 'ev_rvdk')
op('move', 'x1,%s' % m('rmode'), comment='closed: switch')
op('clr', 'a')
op('move', 'a,%s' % m('rho'))
lab('ev_rvdk')
op('clr', 'b')
op('bra', 'ev_rvup')
lab('ev_rvok')
op('move', '%s,b' % imm(ONE))
lab('ev_rvup')
upd('dk')
op('bra', 'ev_loop')

# ---- group 3: MIX, TILT, the wet-off cleanup ------------------------------------------------
lab('ev_gr3')
L_('; MIX (slot 5): equal power, wg = sin(pi m/2), dg = cos(pi m/2); 0 is the exact dry')
ku(K_(5))
op('move', 'a,%s' % m('tm'))
op('tst', 'a')
op('beq', 'ev_mxz', comment='MIX 0: no wet gains or tilt to work out')
sinq()
op('move', 'a,x0', comment='wet gain, limited at 1')
op('move', 'x0,%s' % m('tc'))
op('move', '%s,b' % m('tm'))
op('move', '%s,a' % imm(ONE))
op('sub', 'b,a', comment='1 - m')
sinq()
op('sub', '%s,a' % imm(ONE), comment='dg - 1')
op('tfr', 'a,b')
upd('dgm1', snap=True)
L_('; TILT (slot 6, SETUP A), t: lows below 250 Hz 2^(-2t) (+-12 dB), highs above 2 kHz 2^(4t)')
L_('; (-+24 dB), mids untouched: t0 = k wg, t1 = t0 (gL - 1), t2 = t0 (gH - 1), k = 3.5/64')
kt('x:(r6+$c)', 'hi')
op('move', 'a,%s' % m('tt'))
op('sub', '%s,a' % imm(ONE))
op('asr', 'a')
ex2(3)
op('move', 'a,%s' % m('tm'), comment='gH/16')
op('move', '%s,a' % m('tt'))
op('add', '%s,a' % imm(ONE))
op('asr', 'a')
op('neg', 'a')
ex2(2)
op('move', 'a,%s' % m('tt'), comment='gL/4')
op('move', '%s,x0' % m('tc'))
op('mpyi', '%s,x0,b' % imm(tilt_scale()), comment='t0 = k wg')
op('move', 'b,%s' % m('tc'))
upd('t0', snap=True)
op('move', '%s,a' % m('tt'))
op('sub', '%s,a' % imm(0.25), comment='(gL - 1)/4')
op('move', 'a,x0')
op('move', '%s,y0' % m('tc'))
op('mpy', 'y0,x0,b')
op('asl', '#$2,b,b')
upd('t1', snap=True)
op('move', '%s,a' % m('tm'))
op('sub', '%s,a' % imm(1.0 / 16), comment='(gH - 1)/16')
op('move', 'a,x0')
op('move', '%s,y0' % m('tc'))
op('mpy', 'y0,x0,b')
op('asl', '#$4,b,b')
upd('t2', snap=True)
op('bra', 'ev_mxc')
lab('ev_mxz')
L_('; MIX 0: the dry gain glides to exactly 1 and every wet gain to 0 (the same targets the')
L_('; full path computes there, for less: MIX 0 must not be the dearest setting)')
op('clr', 'b')
upd('dgm1', snap=True)
for p_ in ('t0', 't1', 't2'):
    op('clr', 'b')
    upd(p_, snap=True)
lab('ev_mxc')
L_('; the wet fully off and settled: clear the interpolators, so MIX 0 is bit-exact dry')
op('move', '%s,a' % m('v_t0'))
op('abs', 'a')
for w_ in ('d_t0', 'v_t1', 'd_t1', 'v_t2', 'd_t2'):
    op('move', '%s,b' % m(w_))
    op('abs', 'b')
    op('add', 'b,a')
op('tst', 'a')
op('bne', 'ev_loop')
op('clr', 'a')
for n in ['wL', 'wR', 'iL0', 'iL1', 'iL2', 'jL0', 'jL1', 'iR0', 'iR1', 'iR2', 'jR0', 'jR1', 'tlL', 'tlR', 'txL', 'txR', 'thL', 'thR']:
    op('move', 'a,%s' % m(n))


# ---- the per-frame loop: setup and arm A ---------------------------------------
# The frame loop, hand-scheduled: pointer streams and parallel moves.


# ---- loop setup -----------------------------------------------------------------
lab('ev_loop')
op('move', '%s,r5' % m('head'))
op('move', '#>$ffffff,m1')
op('move', '#>$ffffff,m2')
op('move', '#>$ffffff,m3')
op('move', '#>$ffffff,m6')
op('move', '#>$3fff,m5')
op('move', '#>$3fff,m4')
op('move', '#>$1,n0')
op('move', 'r7,r6')
op('move', '#>$40,n6')
op('move', '(r6)+n6', comment='r6 = r7 + 64: one-word access to the upper half')
INLOOP[0] = True
op('do', 'n7,>ev_end')
op('move', '%s,a' % X_('frac'))
op('add', '#>$040000,a', comment='frac += 1/32 per frame')
op('move', 'a,%s' % X_('frac'))
op('move', '%s,b' % X_('ph'))
op('tst', 'b')
L_('; MODEFORK_BEGIN -- even frames read the tank (A), odd frames write it (B)')
op('bne', 'ev_armb')
L_('; MODEFORK_MID -- A: decimator path 0, modulation, line reads, absorb, decay,')
L_('; saturation, matrix; interpolator path 1')

# ---- A1 input, decimator path 0 (one section), d --------------------------------------
op('move', 'x:(r0),a')
op('move', 'x:(r0+n0),x0')
op('add', 'x0,a')
op(*LUA('dz0', 'r1').split(None, 1))
op('asr', 'a', 'x:(r1)+,b', 'x = (L+R)/2 ; x[n-1]')
op(*LUA('dz0', 'r2').split(None, 1))
op('move', 'x:(r1)+,x0', comment='out[n-1]')
op('sub', 'x0,a', 'a,x:(r2)+', 'x - out[n-1] ; x[n-1] = x')
op('move', 'a,x0')
op('maci', '%s,x0,b' % imm(HD[0]), 'x:(r1)+,y0' if False else '', 'path 0')
op('move', 'x:(r1)+,y0', comment='path 1 of the odd frame')
op('add', 'y0,b', 'b,x:(r2)+', 'path 0 + path 1 ; out[n-1]')
op('asr', 'b', '(r2)+', 'd ; skip p1')
op('move', 'b,x:(r2)+', comment='d; r2 -> the frame values')
# ---- A2 this frame's smoothed values: S, G, clp, c/2, e ------------------------------
op('move', '%s,y1' % X_('frac'))
op(*LUA('v_S', 'r1').split(None, 1))
op('move', 'x:(r1)+,a')
op('move', 'x:(r1)+,x0')
op('mac', 'x0,y1,a', 'x:(r1)+,b', 'S')
op('move', 'x:(r1)+,x0')
op('mac', 'x0,y1,b', 'a,x:(r2)+', 'G ; S')
op('move', 'x:(r1)+,a')
op('move', 'x:(r1)+,x0')
op('mac', 'x0,y1,a', 'b,x:(r2)+', 'clp ; G')
op('move', 'x:(r1)+,b')
op('move', 'x:(r1)+,x0')
op('mac', 'x0,y1,b', 'a,x:(r2)+', 'c/2 ; clp')
op('move', 'x:(r1)+,a')
op('move', 'x:(r1)+,x0')
op('mac', 'x0,y1,a', 'b,x:(r2)+', 'e ; c/2')
op('move', 'a,x:(r2)+', comment='e; r1 -> kosc')
# ---- A3 cyclic quadrature rotation -------------------------------------------------
op('move', 'x:(r1)+,y0', comment='k')
op('move', 'x:(r1)+,a', comment='sx')
op('move', 'x:(r1)-,x0', comment='cy')
op('mac', '-y0,x0,a', 'x0,b', 'sx -= k cy ; b = cy')
op('move', 'a,x0')
op('mac', 'y0,x0,b', 'a,x:(r1)+', 'cy += k sx ; sx')
op('move', 'b,x:(r1)+', comment='cy; r1 -> ct0')
L_('; ct_i = c/2 (1 +- s): lines take +sx, +cy, -sx, -cy')
op('move', '%s,y1' % X_('fv3'), comment='c/2')
op('mpy', 'x0,y1,a', 'b,x0', 'c/2 sx ; cy')
op('mpy', 'x0,y1,b', 'a,x1', 'c/2 cy ; c/2 sx')
op('tfr', 'y1,a', 'b,y0')
op('add', 'x1,a')
op('tfr', 'y1,a', 'a,x:(r1)+', 'ct0')
op('add', 'y0,a')
op('tfr', 'y1,a', 'a,x:(r1)+', 'ct1')
op('sub', 'x1,a')
op('tfr', 'y1,a', 'a,x:(r1)+', 'ct2')
op('sub', 'y0,a')
op('move', 'a,x:(r1)+', comment='ct3')

# ---- A4 grain clock --------------------------------------------------------------------
L_('; grain clock gp (24-bit wrap): line j = gp>>22 crossfades during its quarter;')
L_('; a new quarter latches a random position for line j (a gliding grain on 0 and 2).')
op('move', '%s,a' % X_('gp'))
op('move', '%s,x0' % X_('dp'))
op('add', 'x0,a')
op('move', 'a1,x1')
op('move', 'x1,%s' % X_('gp'))
op('tfr', 'x1,b')
op('lsr', '#$16,b')
op('move', 'b1,y0', comment='j')
op('move', 'y0,n2')
op('tfr', 'y0,b')
op('move', '%s,x0' % X_('jprev'))
op('cmp', 'x0,b')
op('beq', 'ev_nlat')
op('move', 'y0,%s' % X_('jprev'))
op('move', 'r7,r2')
op('lua', '(r2+n2),r2')
L_('; xorshift 5/9/11 (full period on 24 bits)')
op('move', '%s,a' % X_('rng'))
op('move', 'a1,x0')
op('asl', '#$5,a,a')
op('eor', 'x0,a')
op('move', 'a1,x0')
op('lsr', '#$9,a')
op('eor', 'x0,a')
op('move', 'a1,x0')
op('asl', '#$b,a,a')
op('eor', 'x0,a')
op('move', 'a1,%s' % X_('rng'))
op('move', 'a1,x1', comment='r')
op('btst', '#0,y0', comment='odd lines never glide')
op('bcs', 'ev_lstt')
op('and', '#>$000fff,a')
op('asl', '#$b,a,a')
op('move', 'a1,x0')
op('tfr', 'x0,a')
op('move', '%s,x0' % X_('sigt'))
op('cmp', 'x0,a')
op('blt', 'ev_shfl', comment='a gliding grain: position 0, flag bit set')
lab('ev_lstt')
op('tfr', 'x1,a')
op('lsr', 'a')
op('and', '#>$fffffe,a', comment='a static grain: uniform position, flag clear')
op('bra', 'ev_lpos')
lab('ev_shfl')
op('move', '#>$1,a')
lab('ev_lpos')
op('move', 'a1,x0')
op('move', '%s,a' % mi('rnew0'))
op('move', 'a,%s' % mi('rold0'))
op('move', 'x0,%s' % mi('rnew0'))
lab('ev_nlat')
L_('; tau = frac(4 gp); 1 - w with w = 3 tau^2 - 2 tau^3; tau/4')
op('move', '%s,a' % X_('gp'))
op('asl', '#$2,a,a')
op('lsr', 'a')
op('move', 'a1,x0', comment='tau')
op('mpy', 'x0,x0,a')
op('move', 'a,x1')
op('mpy', 'x1,x0,b')
op('sub', 'b,a')
op('asl', 'a')
op('add', 'x1,a', comment='w')
op('neg', 'a')
op('add', '%s,a' % imm(ONEQ))
op('move', 'a,%s' % X_('omw'))
op('tfr', 'x0,b')
op('asr', '#$2,b,b')
op('move', 'b,%s' % X_('tau4'))

# ---- A5 e r_i and the glides, streamed [er0 g0 er1 er2 g2 er3] -----------------------
op('move', '%s,y1' % X_('fv4'), comment='e')
op(*LUA('rnew0', 'r1').split(None, 1))
op(*LUA('er0', 'r2').split(None, 1))
op('move', 'x:(r1)+,x0', comment='r0')
op('mpy', 'x0,y1,a', 'x:(r1)+,x1', 'e r0 ; r1')
op('move', 'a,x:(r2)+')
L_('; a gliding grain on line 0 sheds K0 phase0 = 0.75 (L2/L0) S gp of the line')
op('clr', 'b')
op('btst', '#0,x0')
op('bcc', 'ev_gz0')
op('move', '%s,a' % X_('gp'))
op('lsr', 'a')
op('move', 'a1,x0', comment='line 0 phase')
op('move', '%s,y0' % X_('fv0'), comment='S')
op('mpyi', '%s,y0,b' % imm(0.75 * L[2] / L[0]))
op('move', 'b,y0')
op('mpy', 'y0,x0,b')
lab('ev_gz0')
op('move', 'b,x:(r2)+', comment='g0')
op('mpy', 'y1,x1,a', 'x:(r1)+,x0', 'e r1 ; r2')
op('mpy', 'x0,y1,b', 'a,x:(r2)+', 'e r2 ; er1')
op('move', 'b,x:(r2)+', comment='er2')
L_('; line 2: K2 phase2 = 0.75 S (gp - 1/2)')
op('clr', 'b')
op('btst', '#0,x0')
op('bcc', 'ev_gz2')
op('move', '%s,a' % X_('gp'))
op('add', '#>$800000,a')
op('move', 'a1,x0')
op('tfr', 'x0,a')
op('lsr', 'a')
op('move', 'a1,x0', comment='line 2 phase')
op('move', '%s,y0' % X_('fv0'))
op('mpyi', '%s,y0,b' % imm(0.75))
op('move', 'b,y0')
op('mpy', 'y0,x0,b')
lab('ev_gz2')
op('move', 'x:(r1)+,x0', comment='r3')
op('mpy', 'x0,y1,a', 'b,x:(r2)+', 'e r3 ; g2')
op('move', 'a,x:(r2)+', comment='er3')

# ---- A6 the four new heads ----------------------------------------------------------
L_('; heads: m = ct + e r ; u = S - S m (- glide) ; offset = W - u L ; interpolate')
op('move', '%s,x1' % X_('fv0'), comment='S, for all four')
op(*LUA('ct0', 'r1').split(None, 1))
op(*LUA('er0', 'r2').split(None, 1))
op(*LUA('yv0', 'r3').split(None, 1))
op('move', 'x:(r1)+,a', comment='ct0')
op('move', 'x:(r2)+,y0', comment='e r0')
for i in range(4):
    P, Q = ('a', 'b') if i % 2 == 0 else ('b', 'a')
    L_('; line %d' % i)
    if i == 0:
        op('add', 'y0,%s' % P, comment='m')
    else:
        op('add', 'y0,%s' % P, '%s,x:(r3)+' % Q, 'm ; line %d head' % (i - 1))
    op('tfr', 'x1,%s' % Q, '%s,x0' % P, 'S ; m')
    if i in (0, 2):
        op('mac', '-x1,x0,%s' % Q, 'x:(r2)+,y0', 'S - S m ; glide')
        op('sub', 'y0,%s' % Q, comment='u')
        L_('; a glide never reads ahead of its line (cyclic depth can rise under it): u >= 2^-11')
        op('move', '#>$001000,x0')
        op('cmp', 'x0,%s' % Q)
        op('tlt', 'x0,%s' % Q)
    else:
        op('mac', '-x1,x0,%s' % Q, comment='u')
    op('move', '%s,x0' % Q)
    op('move', '%s,y0' % imm(-L[i]))
    op('mpy', 'y0,x0,%s' % P)
    op('add', '%s,%s' % (imm(seg['ln%d' % i]), P))
    op('move', '%s1,n5' % P)
    op('move', '%s0,%s1' % (P, Q), comment='fraction (u >= 0 left the extension clear)')
    op('lua', '(r5+n5),r4')
    op('lsr', Q, 'y:(r4)+,y1', 'psi ; s0')
    op('move', '%s,x0' % Q, 'y:(r4),y0', 'psi ; s1')
    if i < 3:
        op('mpy', 'y0,x0,%s' % P, 'x:(r1)+,%s' % Q, 'next ct')
        op('mac', '-x0,y1,%s' % P, 'x:(r2)+,y0', 'next e r')
    else:
        op('mpy', 'y0,x0,%s' % P)
        op('mac', '-x0,y1,%s' % P)
    op('add', 'y1,%s' % P)
op('move', 'b,x:(r3)+', comment='line 3 head')

# ---- A7 the old head of line j ------------------------------------------------------
L_('; the line in its quarter keeps its old head, crossfaded out by 1 - w')
op('move', '%s,n2' % X_('jprev'))
op('move', 'r7,r2')
op('lua', '(r2+n2),r2')
op('move', '%s,a' % mi('ct0'))
op('move', '%s,y1' % X_('fv4'), comment='e')
op('move', '%s,y0' % mi('rold0'))
op('mac', 'y1,y0,a', comment='m old')
op('tfr', 'x1,b', 'a,x0')
op('mac', '-x1,x0,b', comment='u old')
op('btst', '#0,y0', comment='was it a gliding grain?')
op('bcc', 'ev_nko')
op('move', '%s,y1' % X_('fv0'))
op('mpyi', '%s,y1,a' % imm(0.75 * L[2] / L[0]))
op('move', '%s,x0' % X_('jprev'))
op('btst', '#1,x0')
op('bcc', 'ev_kj0')
op('mpyi', '%s,y1,a' % imm(0.75), comment='line 2')
lab('ev_kj0')
op('sub', 'a,b', comment='- K')
op('move', 'a,x0')
op('move', '%s,y0' % X_('tau4'))
op('mac', '-y0,x0,b', comment='- K tau/4: the old grain glides on')
lab('ev_nko')
op('move', '#>$001000,x0')
op('cmp', 'x0,b')
op('tlt', 'x0,b', comment='u old >= 2^-11, as the new heads')
op('move', 'b,x0')
op('move', '%s,y0' % mi('ll0'))
op('mpy', 'y0,x0,a')
op('move', '%s,y0' % mi('lw0'))
op('add', 'y0,a')
interp_read('a', 'b', 'old head')
op('move', '%s,b' % mi('yv0'))
op('sub', 'b,a', comment='old - new')
op('move', 'a,x0')
op('move', '%s,y0' % X_('omw'))
op('mac', 'y0,x0,b')
op('move', 'b,%s' % mi('yv0'))

# ---- A8 absorb, DC (lines 0, 1), decay, saturation -> f, taps -----------------------
L_('; absorb lp += clp (x - lp); lines 0 and 1 then block DC (exact zero, no dead')
L_('; band); h = 16 G x, s/2 = (0.375 h - 0.125 h^3)/2 into the matrix')
op('move', '%s,y0' % X_('fv2'), comment='clp')
op('move', '%s,y1' % X_('fv1'), comment='G')
op(*LUA('yv0', 'r1').split(None, 1))
op(*LUA('lp0', 'r2').split(None, 1))
op(*LUA('f0', 'r3').split(None, 1))
for i in range(4):
    L_('; line %d' % i)
    op('move', 'x:(r1),a', comment='x')
    op('move', 'x:(r2),b', comment='lp')
    op('sub', 'b,a')
    op('move', 'a,x0')
    op('mac', 'y0,x0,b', comment='lp')
    if i < 2:
        op('move', 'b,x:(r2)+')
        op('move', '%s,x0' % X_('dcx%d' % i), comment='x[n-1]')
        op('move', 'b,%s' % X_('dcx%d' % i))
        op('sub', 'x0,b', comment='x - x[n-1]')
        op('move', '%s,b0' % X_('dce%d' % i), comment='the remainder')
        op('move', '%s,x0' % X_('dc%d' % i), comment='y[n-1]')
        op('maci', '%s,x0,b' % imm(RDC))
        op('move', 'b0,%s' % X_('dce%d' % i))
        op('move', 'b,%s' % X_('dc%d' % i))
        op('move', 'b,x0')
        op('mpy', 'x0,y1,a', comment='G x')
    else:
        op('move', 'b,x0')
        op('mpy', 'x0,y1,a', 'b,x:(r2)+', 'G x ; lp')
    op('asl', '#$4,a,a', comment='h = 16 G x')
    op('move', 'a,x0', comment='limits to +-1')
    op('mpy', 'x0,x0,b', 'b,x:(r1)+', 'h^2 ; the tap')
    op('move', 'b,x1')
    op('mpy', 'x1,x0,b', comment='h^3')
    op('move', 'b,x1')
    op('mpyi', '%s,x0,a' % imm(HALF_SAT[0]))
    op('maci', '%s,x1,a' % imm(-HALF_SAT[1]))
    op('move', 'a,x:(r3)+', comment='s/2')
L_('; stereo taps: L = x0 - x2, R = x1 - x3')
op(*LUA('yv0', 'r1').split(None, 1))
op('move', 'x:(r1)+,a')
op('move', 'x:(r1)+,b')
op('move', 'x:(r1)+,x0')
op('sub', 'x0,a', 'x:(r1)+,x0')
op('sub', 'x0,b', 'a,%s' % 'x:(r3)+', 'R ; L (r3 -> sL)')
op('move', 'b,x:(r3)+', comment='R')
L_('; 4x4 Hadamard / 2 (the halving is in s/2)')
op(*LUA('f0', 'r1').split(None, 1))
op(*LUA('f0', 'r2').split(None, 1))
op('move', 'x:(r1)+,a', comment='s0')
op('move', 'x:(r1)+,x0', comment='s1')
op('tfr', 'a,b', 'x:(r1)+,y0', 's2')
op('add', 'x0,a', 'x:(r1)+,y1', 'P = s0 + s1 ; s3')
op('sub', 'x0,b', 'a,x1', 'Q = s0 - s1 ; P')
op('tfr', 'y0,a', 'b,x0', 'Q')
op('add', 'y1,a', comment='R = s2 + s3')
op('tfr', 'y0,b', 'a,y0', 'R')
op('sub', 'y1,b', comment='T = s2 - s3')
op('tfr', 'x1,a', 'b,y1', 'T')
op('add', 'y0,a', comment='f0 = P + R')
op('tfr', 'x0,a', 'a,x:(r2)+')
op('add', 'y1,a', comment='f1 = Q + T')
op('tfr', 'x1,a', 'a,x:(r2)+')
op('sub', 'y0,a', comment='f2 = P - R')
op('tfr', 'x0,a', 'a,x:(r2)+')
op('sub', 'y1,a', comment='f3 = Q - T')
op('move', 'a,x:(r2)+')

# ---- A9 interpolator path 1 (c1), last tick's wet ----------------------------------
L_("; interpolator path 1 (c1) on last tick's wet: the odd frame's output")
for ch in 'LR':
    op('move', '%s,a' % X_('w' + ch))
    op(*LUA('j%s0' % ch, 'r1').split(None, 1))
    op(*LUA('j%s0' % ch, 'r2').split(None, 1))
    op('move', 'x:(r1)+,b', comment='x[n-1]')
    op('move', 'x:(r1)+,x0', comment='out[n-1]')
    op('sub', 'x0,a', 'a,x:(r2)+', 'x - out[n-1] ; x[n-1]')
    op('move', 'a,x0')
    op('maci', '%s,x0,b' % imm(HB[1]))
    op('move', 'b,x:(r2)+', comment='out (the odd frame reads it)')
op('move', '#>$1,a')
op('move', 'a,%s' % X_('ph'))
op('move', '%s,x0' % X_('iL2'), comment='this frame: path 0 of the last tick')
op('move', '%s,x1' % X_('iR2'))
op('bra', 'ev_join')


# ---- arm B, output and self-checks ---------------------------------------------
# B arm and the per-frame mix.

L_('; MODEFORK_MID -- B: decimator path 1, pre-delay or reverse, four allpasses and')
L_('; line writes, early taps, envelope, tilt; interpolator path 0')
lab('ev_armb')
# ---- B1 input, decimator path 1 (c1) ---------------------------------------------------
op('move', 'x:(r0),a')
op('move', 'x:(r0+n0),x0')
op('add', 'x0,a')
op(*LUA('dw0', 'r1').split(None, 1))
op('asr', 'a', 'x:(r1)+,b', 'x ; x[n-1]')
op(*LUA('dw0', 'r2').split(None, 1))
op('move', 'x:(r1)+,x0', comment='out[n-1]')
op('sub', 'x0,a', 'a,x:(r2)+', 'x - out[n-1] ; x[n-1]')
op('move', 'a,x0')
op('maci', '%s,x0,b' % imm(HD[1]), comment='path 1')
op('move', 'b,x:(r2)+')
op('move', 'b,%s' % X_('p1'), comment='for the next even frame')
# ---- B2 smoothed values: S (kept in x1), then gap prel t0 t1 t2 dk -> fv1..fv6 ----------
op('move', '%s,y1' % X_('frac'))
op(*LUA('v_gap', 'r1').split(None, 1))
op(*LUA('fv1', 'r2').split(None, 1))
op('move', 'x:(r1)+,a')
op('move', 'x:(r1)+,x0')
seq = ['gap', 'prel', 't0', 't1', 't2', 'dk']
for k in range(6):
    acc, oth = ('a', 'b') if k % 2 == 0 else ('b', 'a')
    if k == 0:
        op('mac', 'x0,y1,%s' % acc, 'x:(r1)+,%s' % oth, seq[k])
    elif k < 5:
        op('mac', 'x0,y1,%s' % acc, '%s,x:(r2)+' % oth, '%s ; %s' % (seq[k], seq[k - 1]))
    else:
        op('mac', 'x0,y1,%s' % acc, '%s,x:(r2)+' % oth, '%s ; %s' % (seq[k], seq[k - 1]))
    if k < 5:
        if k > 0:
            op('move', 'x:(r1)+,%s' % oth)
        op('move', 'x:(r1)+,x0')
op('move', 'b,x:(r2)+', comment='dk')

# ---- B3 pre-delay: write d, read it back after D, or reverse ---------------------------------
op('move', '%s,a' % X_('d'))
op('move', 'a,y:(r5)', comment='the pre-delay write')
op('move', '%s,b' % X_('rmode'))
op('tst', 'b')
op('bne', 'ev_rvrs')
op('move', '%s,x0' % X_('fv2'), comment='D/5512')
op('move', '%s,y0' % imm(-PRE))
op('mpy', 'y0,x0,a')
interp_read('a', 'b', 'q')
op('bra', 'ev_pred')
lab('ev_rvrs')
L_('; reverse: two heads sweep back through W = max(D, 42 ms), smoothstep crossfade.')
L_('; head offset = -(2 + phase (W-4)), the phase a 24-bit wrap stepped 2/W per tick')
op('move', '%s,a' % X_('fv2'))
op('move', '%s,x0' % imm(W_MIN / PRE))
op('cmp', 'x0,a')
op('tlt', 'x0,a')
op('sub', '%s,a' % imm(4.0 / PRE), comment='uw = (W - 4)/5512')
op('move', 'a,x0')
op('mpyi', '#>%s,x0,a' % hx(-PRE), comment='-(W - 4), whole samples')
op('move', 'a1,%s' % X_('rw'))
op('move', '%s,a' % X_('rho'))
op('move', '%s,x0' % X_('drho'))
op('add', 'x0,a')
op('move', 'a1,x1', comment='rho')
op('move', 'x1,%s' % X_('rho'))
op('tfr', 'x1,a')
op('abs', 'a', comment='triangle')
op('move', 'a,x0', comment='limits at 1')
op('mpy', 'x0,x0,a')
op('move', 'a,y0')
op('mpy', 'y0,x0,b')
op('sub', 'b,a')
op('asl', 'a')
op('add', 'y0,a', comment='head A weight')
op('move', 'a,%s' % X_('q'))
for hd in 'AB':
    if hd == 'A':
        op('tfr', 'x1,a')
    else:
        op('move', '%s,a' % X_('rho'))
        op('add', '#>$800000,a')
        op('move', 'a1,x0')
        op('tfr', 'x0,a')
    op('lsr', 'a')
    op('move', 'a1,x0', comment='head %s phase' % hd)
    op('move', '%s,y1' % X_('rw'))
    op('mpy', 'x0,y1,a', comment='-phase (W-4)')
    op('sub', '#$2,a')
    op('clr', 'b')
    interp_read('a', 'b', 'head %s' % hd)
    if hd == 'A':
        op('move', 'a,%s' % X_('rA'))
op('tfr', 'a,b', comment='B')
op('move', '%s,a' % X_('rA'))
op('sub', 'b,a', comment='A - B')
op('move', 'a,x0')
op('move', '%s,y0' % X_('q'))
op('mac', 'y0,x0,b')
op('tfr', 'b,a', comment='q = B + wA (A - B)')
lab('ev_pred')
L_('; duck (REV switching), input DC block, qi = q/8 (the allpass inputs are quartered)')
op('move', 'a,x0')
op('move', '%s,y0' % X_('fv6'), comment='duck')
op('mpy', 'y0,x0,a')
op('move', '%s,x0' % X_('dcinx'))
op('move', 'a,%s' % X_('dcinx'))
op('sub', 'x0,a')
op('move', '%s,a0' % X_('dcine'))
op('move', '%s,x0' % X_('dcin'))
op('maci', '%s,x0,a' % imm(RDCIN))
op('move', 'a0,%s' % X_('dcine'))
op('move', 'a,%s' % X_('dcin'))
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(INJ / 4))
op('move', '%s,x1' % X_('fv0'), comment='S from the even frame')
op('move', 'a,%s' % X_('fv0'), comment='qi, beside g')

# ---- B4 four allpasses (state stored /4) and line writes --------------------------------
L_("; allpass i: Wd at a_i S; W' = v/4 + g Wd ; y/4 = Wd - g W' into the line")
op(*LUA('f0', 'r1').split(None, 1))
op(*LUA('ap0', 'r2').split(None, 1))
op(*LUA('fv0', 'r3').split(None, 1))
for i in range(4):
    L_('; line %d' % i)
    op('move', '%s,y0' % imm(-A[i]))
    op('mpy', 'x1,y0,a', comment='-a S')
    op('add', '%s,a' % imm(seg['ap%d' % i]))
    op('clr', 'b')
    op('move', 'a1,n5')
    op('move', 'a0,b1')
    op('lua', '(r5+n5),r4')
    op('lsr', 'b', 'y:(r4)+,y1')
    op('move', 'b,x0', 'y:(r4),y0')
    op('mpy', 'y0,x0,a')
    op('mac', '-x0,y1,a')
    op('add', 'y1,a', 'x:(r3)+,x0', 'Wd ; qi')
    op('move', 'x:(r1)+,b', 'a,y0', 'f/4 ; Wd')
    op('add', 'x0,b', 'x:(r3)-,x0', 'v/4 ; g')
    op('mac', 'y0,x0,b', comment="W'")
    op('move', '%s,n5' % imm(seg['ap%d' % i]))
    op('move', 'b,y:(r5+n5)')
    op('tfr', 'y0,a', 'b,y1')
    op('mac', '-x0,y1,a', comment='y/4')
    op('move', '%s,n5' % imm(seg['ln%d' % i]))
    op('move', 'a,y:(r5+n5)')
    op('move', 'a,x:(r2)+', comment='early tap')

# ---- B5 taps + early reflections, envelope ---------------------------------------------
L_('; wet = taps + 0.5 (allpass outputs): L takes y0 - y3, R y1 - y2')
op(*LUA('ap0', 'r1').split(None, 1))
op('move', 'x:(r1)+,a', comment='y0')
op('move', 'x:(r1)+,b', comment='y1')
op('move', 'x:(r1)+,x0', comment='y2')
op('sub', 'x0,b', 'x:(r1)+,x0', 'y1 - y2 ; y3')
op('sub', 'x0,a', 'b,y1')
op('move', 'a,y0')
op('move', '%s,a' % X_('sL'))
op('maci', '%s,y0,a' % imm(ER_G))
op('move', '%s,b' % X_('sR'))
op('maci', '%s,y1,b' % imm(ER_G))
op('move', 'a,%s' % X_('wL'))
op('move', 'b,%s' % X_('wR'))
op('abs', 'a')
op('abs', 'b')
op('add', 'b,a')
op('move', '%s,b' % X_('env'))
op('sub', 'b,a')
op('move', 'a,x0')
op('maci', '%s,x0,b' % imm(KENV))
op('move', 'b,%s' % X_('env'))

# ---- B6 tilt and wet gain -----------------------------------------------------------
L_('; tilt: lo += k (w - lo) ; hi = bilinear high-pass ; y = 64 (t0 w + t1 lo + t2 hi)')
op(*LUA('tlL', 'r1').split(None, 1))
op(*LUA('tlL', 'r2').split(None, 1))
for ch in 'LR':
    op('move', '%s,a' % X_('w' + ch))
    op('move', 'x:(r1)+,b', comment='lo')
    op('sub', 'b,a', 'a,y1', 'w - lo ; y1 = w')
    op('move', 'a,x0')
    op('maci', '%s,x0,b' % imm(KTLO), comment='lo')
    op('tfr', 'y1,a', 'b,x:(r2)+', 'w ; lo')
    op('move', 'x:(r1)+,x0', comment='x[n-1]')
    op('sub', 'x0,a', 'y1,x:(r2)+', 'w - x[n-1] ; x[n-1] = w')
    op('move', 'a,x0')
    op('mpyi', '%s,x0,a' % imm(THG))
    op('move', 'x:(r1)+,x0', comment='hi[n-1]')
    op('maci', '%s,x0,a' % imm(THC), comment='hi')
    op('move', 'a,x:(r2)+')
    op('move', 'a,x0')
    op('move', '%s,y0' % X_('fv5'), comment='t2')
    op('mpy', 'y0,x0,a')
    op('move', '%s,x0' % X_('fv3'), comment='t0')
    op('mac', 'x0,y1,a', comment='+ t0 w')
    op('move', 'b,x0', comment='lo')
    op('move', '%s,y0' % X_('fv4'), comment='t1')
    op('mac', 'y0,x0,a')
    op('asl', '#$6,a,a')
    op('move', 'a,%s' % X_('w' + ch), comment='the wet, limited')

# ---- B7 interpolator path 0 (c0, c2) -----------------------------------------------------
L_('; interpolator path 0 (c0, c2): the next even frame')
for ch in 'LR':
    op('move', '%s,a' % X_('w' + ch))
    op(*LUA('i%s0' % ch, 'r1').split(None, 1))
    op(*LUA('i%s0' % ch, 'r2').split(None, 1))
    op('move', 'x:(r1)+,b')
    op('move', 'x:(r1)+,x1')
    op('sub', 'x1,a', 'a,x:(r2)+')
    op('move', 'a,x0')
    op('maci', '%s,x0,b' % imm(HB[0]))
    op('move', 'x:(r1)+,x0')
    op('tfr', 'x1,a', 'b,x:(r2)+')
    op('sub', 'x0,b')
    op('move', 'b,x0')
    op('maci', '%s,x0,a' % imm(HB[2]))
    op('move', 'a,x:(r2)+', comment='the even output')
op('move', '(r5)+', comment='the ring head moves one tick')
op('clr', 'a')
op('move', 'a,%s' % X_('ph'))
op('move', '%s,x0' % X_('jL1'), comment='this frame: path 1 from the even frame')
op('move', '%s,x1' % X_('jR1'))
L_('; MODEFORK_END')
lab('ev_join')
L_('; out = dry (1 + dgm1) + wet, dgm1 ramped per frame')
op('move', '%s,b' % X_('v_dgm1'))
op('move', '%s,y0' % X_('d_dgm1'))
op('move', '%s,y1' % X_('frac'))
op('mac', 'y1,y0,b', 'x:(r0),y1', 'dgm1 ; L')
op('tfr', 'y1,a', 'b,y0')
op('mac', 'y1,y0,a')
op('add', 'x0,a')
op('move', 'a,x:(r0)+')
op('move', 'x:(r0),y1')
op('tfr', 'y1,a')
op('mac', 'y1,y0,a')
op('add', 'x1,a')
op('move', 'a,x:(r0)+')
lab('ev_end')
op('nop')
op('move', 'r5,%s' % m('head'))
INLOOP[0] = False
for reg in ('m1', 'm2', 'm3', 'm4', 'm5', 'm6'):
    op('move', '#>$ffffff,%s' % reg)
op('rts')

# ---- per-call subroutines (after every caller: each bsr is a forward branch) ----------
# Called only from the per-call knob groups, never from the per-frame loop, so
# they cost a few cycles per call; the inline copies cost about 110 words.
e('')
L_('; Per-call subroutines. Only the knob groups call these, never the frame loop.')
L_('; ev_upd: b = target, n1 = the offset of v_p: d_p = (target - v_p)/8')
lab('ev_upd')
op('move', 'r7,r1')
op('lua', '(r1+n1),r1')
op('move', 'x:(r1)+,a', comment='now')
op('sub', 'a,b', comment='target - now')
op('asr', '#$3,b,b')
op('move', 'b,x:(r1)')
op('rts')
L_('; ev_usn: the same, landing on the target when within 2^-13')
lab('ev_usn')
op('move', 'r7,r1')
op('lua', '(r1+n1),r1')
op('move', 'x:(r1),a', comment='now')
op('sub', 'a,b', comment='target - now')
op('move', 'b,x0')
op('abs', 'b')
op('cmp', '#>$000400,b')
op('bge', 'ev_uglid')
op('add', 'x0,a', comment='close: land on it')
op('move', 'a,x:(r1)+')
op('clr', 'b')
op('move', 'b,x:(r1)')
op('rts')
lab('ev_uglid')
op('tfr', 'x0,b')
op('asr', '#$3,b,b')
op('move', 'b,x:(r1+$1)')
op('rts')
L_('; ev_exq: a = v in [-1.125, 0] -> a = (2^v)^4. Clobbers x0, y0.')
lab('ev_exq')
op('move', 'a,x0')
op('mpyi', '%s,x0,a' % imm(EXP[3]))
op('add', '%s,a' % imm(EXP[2]))
op('move', 'a,y0')
op('mpy', 'y0,x0,a')
op('add', '%s,a' % imm(EXP[1]))
op('move', 'a,y0')
op('mpy', 'y0,x0,a')
op('add', '%s,a' % imm(EXP[0]))
for _ in range(2):
    op('move', 'a,x0')
    op('mpy', 'x0,x0,a')
op('rts')
L_('; ev_sin: a = m in [0, 1] -> a = sin(pi m/2). Clobbers x0, x1, y0.')
lab('ev_sin')
op('move', 'a,x0')
op('mpy', 'x0,x0,a')
op('move', 'a,x1', comment='m^2')
op('mpyi', '%s,x1,a' % imm(SINP[2] / 2))
op('add', '%s,a' % imm(SINP[1] / 2))
op('move', 'a,y0')
op('mpy', 'x1,y0,a')
op('add', '%s,a' % imm(SINP[0] / 2))
op('move', 'a,y0')
op('mpy', 'y0,x0,a', comment='s/2')
op('asl', 'a')
op('rts')

labels = [l[:-1] for l in out if l.endswith(':') and not l.startswith(' ')]
for a_ in labels:
    for b_ in labels:
        assert a_ == b_ or not b_.startswith(a_), ('label prefix', a_, b_)
SIGNED = {('x0', 'x0'), ('y0', 'y0'), ('x1', 'x0'), ('y1', 'y0'), ('x0', 'y1'), ('y0', 'x0'), ('x1', 'y0'), ('y1', 'x1')}
for l in out:
    t = l.split(';')[0].split()
    if t and t[0] in ('mpy', 'mac', 'mpyr', 'macr'):
        ops = t[1].lstrip('-').split(',')
        assert (ops[0], ops[1]) in SIGNED, ('unsigned operand order', l)


TEXT = '\n'.join(out) + '\n'
if __name__ == '__main__':
    target = pathlib.Path(__file__).resolve().with_name('everb.asm')
    if '--write' in sys.argv:
        target.write_text(TEXT)
    elif '--check' in sys.argv:
        if target.read_text() != TEXT:
            sys.exit('everb.asm differs from generate.py: run python3 generate.py --write')
        print('everb.asm matches generate.py')
    else:
        sys.stdout.write(TEXT)

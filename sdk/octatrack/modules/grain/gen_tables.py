#!/usr/bin/env python3
"""Escribe gran_tables.h: las tablas del granular de Model-TG (tools/gen_granular_tables.py, TinyGregAudio, MIT),
con las mismas fórmulas. Solo SIZE cambia de frecuencia: el original va a 48 kHz (480 * 100^(d/127) muestras) y el
Octatrack a 44,1 kHz (441 * 100^(d/127)), así que cada valor dura los mismos milisegundos (10 ms .. 1 s)."""
import math, os

RATE = 44100
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gran_tables.h')
L = ["/* gran_tables.h - generado por gen_tables.py. No editar. */", "#include <stdint.h>"]

def arr(ctype, name, vals, per=16, doc=""):
    if doc:
        L.append("/* " + doc + " */")
    L.append("static const %s %s[%d] = {" % (ctype, name, len(vals)))
    for i in range(0, len(vals), per):
        L.append("    " + ",".join(map(str, vals[i:i + per])) + ",")
    L.append("};")

hann = [round(32767 * math.sin(math.pi * (i + 0.5) / 256) ** 2) for i in range(256)]
tri = [round(32767 * (1 - abs((i + 0.5) / 128 - 1))) for i in range(256)]
perc = [round(32767 * (i + 0.5) / 12) if i < 12 else round(32767 * math.exp(-4.6 * (i - 12) / 243)) for i in range(256)]
sq = [round(32767 * min(1, (i + 0.5) / 8, (255.5 - i) / 8)) for i in range(256)]
arr("uint16_t", "gran_hann", hann, doc="Hann, 256 pasos, Q15 (NORMAL)")
arr("uint16_t", "gran_tri", tri, doc="Triangular")
arr("uint16_t", "gran_perc", perc, doc="Percusiva: ataque de 12 pasos, caida exponencial a ~-40 dB")
arr("uint16_t", "gran_sq", sq, doc="Cuadrada con rampas de 8 pasos para no hacer clic")
size = [round(RATE / 100 * 100 ** (d / 127)) for d in range(128)]
arr("uint32_t", "gran_size", size, per=8, doc="SIZE 0..127 -> muestras a %d Hz, 10 ms .. 1 s" % RATE)
dens = [round(256 * 2 ** (2 - 4 * d / 127)) for d in range(128)]
arr("uint16_t", "gran_dens", dens, doc="DENS 0..127 -> espaciado en multiplos del largo, Q8 (identico al original)")
open(out, 'w').write("\n".join(L) + "\n")
print("escrito", out)

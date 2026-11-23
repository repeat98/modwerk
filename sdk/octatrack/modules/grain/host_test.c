/* host_test.c - prueba del motor en el PC: lee un WAV de 16 bits (o genera un tono si no se da ninguno), toca una nota
 * granular y escribe un WAV estereo de 44,1 kHz para escucharlo.
 *   host_test [entrada.wav] salida.wav [pos size dens spray shape dir pan sync]                                         */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "gran.h"

static int16_t *load_wav(const char *path, uint32_t *frames, unsigned *ch)
{
    FILE *f = fopen(path, "rb");
    unsigned char h[12], c[8];
    unsigned bits = 0;
    int16_t *data = 0;
    if (!f) return 0;
    if (fread(h, 1, 12, f) != 12 || memcmp(h, "RIFF", 4) || memcmp(h + 8, "WAVE", 4)) { fclose(f); return 0; }
    while (fread(c, 1, 8, f) == 8) {
        uint32_t len = c[4] | c[5] << 8 | c[6] << 16 | (uint32_t)c[7] << 24;
        if (!memcmp(c, "fmt ", 4)) {
            unsigned char fm[40];
            if (fread(fm, 1, len < 40 ? len : 40, f) < 16) break;
            if (len > 40) fseek(f, len - 40, SEEK_CUR);
            *ch = fm[2]; bits = fm[14];
        } else if (!memcmp(c, "data", 4) && bits == 16) {
            data = malloc(len);
            *frames = (uint32_t)(fread(data, 1, len, f) / (2u * *ch));
            break;
        } else fseek(f, len + (len & 1), SEEK_CUR);
    }
    fclose(f);
    return data;
}

static const uint8_t *g_be;
static uint32_t g_perpage;
static uintptr_t paged(const void *ctx, uint32_t frame, uint32_t *first, uint32_t *n)
{
    (void)ctx;
    *first = frame - frame % g_perpage; *n = g_perpage;
    return (uintptr_t)(g_be + (size_t)*first * 6144u / g_perpage);
}

static void put32(FILE *f, uint32_t v) { fputc(v, f); fputc(v >> 8, f); fputc(v >> 16, f); fputc(v >> 24, f); }

int main(int argc, char **argv)
{
    const char *in = argc > 2 ? argv[1] : 0, *outp = argc > 2 ? argv[2] : argc > 1 ? argv[1] : "salida.wav";
    int base = argc > 2 ? 3 : 2;
    uint32_t frames = 0; unsigned ch = 1;
    int16_t *raw = in ? load_wav(in, &frames, &ch) : 0;
    if (!raw) { /* tono de prueba: 2 s, acorde con algo de ruido */
        frames = 88200; ch = 1; raw = malloc(frames * 2);
        uint32_t r = 1;
        for (uint32_t i = 0; i < frames; ++i) {
            double t = i / 44100.0;
            r = r * 1103515245u + 12345u;
            raw[i] = (int16_t)(8000 * (sin(2 * M_PI * 220 * t) + sin(2 * M_PI * 277.2 * t) + sin(2 * M_PI * 329.6 * t * (1 + t))) +
                               ((int)(r >> 16 & 0x7ff) - 1024));
        }
    }
    /* Como lo guarda la Octatrack: big-endian, intercalado, en paginas de 6144 octetos (aqui seguidas en memoria) */
    unsigned chans = ch > 1 ? 2 : 1;
    uint8_t *be = malloc((size_t)frames * 2 * chans);
    for (uint32_t i = 0; i < frames; ++i)
        for (unsigned c = 0; c < chans; ++c) {
            uint16_t v = (uint16_t)raw[i * ch + c];
            be[(i * chans + c) * 2] = (uint8_t)(v >> 8); be[(i * chans + c) * 2 + 1] = (uint8_t)v;
        }
    g_be = be; g_perpage = 6144u / (2u * chans);
    GranSample s = { frames, 2, (uint8_t)chans, paged, 0 };
    GranParams p = { 40, 70, 90, 30, 0, 0, 0, 0, 0 };
    uint8_t *pv = &p.pos;
    for (int i = 0; base + i < argc && i < 10; ++i) pv[i] = (uint8_t)atoi(argv[base + i]);   /* ... sync freeze scan */
    if (getenv("EDGE")) p.edge = (uint8_t)atoi(getenv("EDGE"));
    static GranEngine e;
    gran_init(&e);
    gran_trigger(&e, 0);
    const unsigned secs = 8, total = 44100 * secs;
    FILE *f = fopen(outp, "wb");
    if (!f) return 1;
    fwrite("RIFF", 1, 4, f); put32(f, 36 + total * 4); fwrite("WAVEfmt ", 1, 8, f);
    put32(f, 16); put32(f, 1 | 2 << 16); put32(f, 44100); put32(f, 44100 * 4); put32(f, 4 | 16 << 16);
    fwrite("data", 1, 4, f); put32(f, total * 4);
    int32_t buf[32];
    for (unsigned done = 0; done < total; done += 16) {
        GranParams q = p;
        if (done >= total / 2) q.pos = (uint8_t)(p.pos + (127 - p.pos) * (done - total / 2) / (total / 2)); /* barrido de POS */
        gran_params(&e, 0, &q, &s, 120 * 24);
        gran_render(&e, 0, &q, &s, getenv("PW") ? atoi(getenv("PW")) : 1, getenv("PF") ? (uint32_t)strtoul(getenv("PF"), 0, 0) : 0, buf, 16);   /* pitch: PW entero, PF fraccion Q32 */
        for (unsigned i = 0; i < 32; ++i) { int16_t v = (int16_t)(buf[i] >> 16); fwrite(&v, 2, 1, f); }
    }
    fclose(f);
    printf("ok: %s (%u frames de sample, %u canales)\n", outp, frames, ch);
    return 0;
}

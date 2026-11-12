/* SPDX-License-Identifier: MIT
 * SYNTIZ's engine on the host.
 *   test_engine check           every note 0..127 at the controls' extremes: no overflow (build with
 *                               -fsanitize=undefined -fno-sanitize-recover), bounded, no DC, silent
 *                               above Nyquist, and the levels below
 *   test_engine render <dir>    the listening set: WAV files, 44.1 kHz mono, with a stand-in for the
 *                               track's AMP envelope (the engine has none; the Octatrack's AMP follows it) */
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "engine.h"

static uint32_t inc_of(double note) { return (uint32_t)(440.0 * pow(2.0, (note - 69.0) / 12.0) / WAVE_RATE * 4294967296.0); }

static int failures;
#define CHECK(c, ...) do { if (!(c)) { ++failures; printf("FAIL " __VA_ARGS__); printf("\n"); } } while (0)

/* Renders seconds of one held note in 16-sample blocks (the Octatrack's frame). */
static void hold(Wave *w, const WaveControls *c, double note, int16_t *buf, unsigned len)
{
    uint32_t inc = inc_of(note);
    for (unsigned at = 0; at < len; at += 16u) wave_render(w, c, inc, buf + at, len - at < 16u ? len - at : 16u);
}

static void stats(const int16_t *b, unsigned n, double *rms, double *dc, int *peak)
{
    double s = 0, q = 0; int p = 0;
    for (unsigned k = 0; k < n; ++k) { s += b[k], q += (double)b[k] * b[k]; if (abs(b[k]) > p) p = abs(b[k]); }
    *rms = sqrt(q / n) / 32768.0, *dc = s / n / 32768.0, *peak = p;
}

static int check(void)
{
    enum { N = 44100 };
    static int16_t buf[N];
    static Wave w;
    const uint8_t ends[] = { 0, 1, 63, 64, 65, 126, 127 };
    unsigned runs = 0;
    for (unsigned m = 0; m < WAVE_MODELS; ++m)
        for (unsigned e = 0; e < sizeof ends; ++e)
            for (unsigned note = 0; note < 128u; note += 1u) {
                WaveControls c = wave_defaults[m];
                uint8_t v = ends[e];
                c.det = c.uni = c.wide = c.sub = c.sub2 = c.pw = c.pwm = c.pws = c.chor = c.drive = v;
                c.table = c.morph = c.msweep = c.sync = c.wav2 = c.mix = c.wid = c.fade = c.bit1 = c.bit2 = v;
                c.note[0] = v, c.note[1] = (uint8_t)(127 - v), c.note[2] = 88;
                wave_reset(&w);
                wave_note(&w, &c);
                hold(&w, &c, note, buf, N / 8);
                ++runs;
            }
    printf("%u extreme runs without a sanitizer report\n", runs);

    /* Above Nyquist: silence, never a fold-back at full level. */
    {
        WaveControls c = wave_defaults[WAVE_SAW];
        wave_reset(&w);
        hold(&w, &c, 140.0, buf, 4096); /* 26.6 kHz */
        double rms, dc; int peak; stats(buf, 4096, &rms, &dc, &peak);
        CHECK(peak == 0, "a note above Nyquist sounds (peak %d)", peak);
    }
    /* Subs below 25 Hz are silent: at C1 (sub 16 Hz, sub2 8 Hz) SUB and SUB2 at 127 change nothing; at
     * C2 the square sub (33 Hz) sounds and the sine (16 Hz) still does not. */
    {
        static int16_t ref[4096];
        WaveControls c = wave_defaults[WAVE_SAW];
        wave_reset(&w); hold(&w, &c, 24.0, ref, 4096);
        c.sub = c.sub2 = 127;
        wave_reset(&w); hold(&w, &c, 24.0, buf, 4096);
        CHECK(!memcmp(ref, buf, sizeof ref), "a sub below 25 Hz sounds");
        c.sub = 0;
        wave_reset(&w); hold(&w, &c, 36.0, buf, 4096);
        c.sub2 = 0;
        wave_reset(&w); hold(&w, &c, 36.0, ref, 4096);
        CHECK(!memcmp(ref, buf, sizeof ref), "SUB2 at 16 Hz sounds");
        c.sub = 127;
        wave_reset(&w); hold(&w, &c, 36.0, buf, 4096);
        CHECK(memcmp(ref, buf, sizeof ref), "SUB at 33 Hz is silent");
    }
    /* MORPH with MIX at 0 (and WID 0, full resolution) plays WAV1 exactly as TABLE plays it, and at 127 WAV2. */
    {
        static int16_t ref[4096];
        WaveControls t = wave_defaults[WAVE_TABLE], c = wave_defaults[WAVE_MORPH];
        t.table = 52, c.table = 52, c.wav2 = 100, c.mix = 0;
        wave_reset(&w); hold(&w, &t, 48.0, ref, 4096);
        wave_reset(&w); hold(&w, &c, 48.0, buf, 4096);
        CHECK(!memcmp(ref, buf, sizeof ref), "MORPH at MIX 0 is not TABLE's WAV1");
        t.table = 100, c.mix = 127;
        wave_reset(&w); hold(&w, &t, 48.0, ref, 4096);
        wave_reset(&w); hold(&w, &c, 48.0, buf, 4096);
        CHECK(!memcmp(ref, buf, sizeof ref), "MORPH at MIX 127 is not TABLE's WAV2");
    }
    /* TIME: a change of WAV1 switches at once at 0 and crossfades above; both end on the same sound. */
    {
        static int16_t at0[N / 2], slow[N / 2];
        WaveControls c = wave_defaults[WAVE_MORPH];
        c.mix = 0;
        for (int pass = 0; pass < 2; ++pass) {
            int16_t *b = pass ? slow : at0;
            c.fade = pass ? 64 : 0, c.table = 8;
            wave_reset(&w); hold(&w, &c, 48.0, b, 4096);
            c.table = 108;
            hold(&w, &c, 48.0, b + 4096, N / 2 - 4096);
        }
        int early = 0, late = 0;
        for (unsigned k = 4096; k < 4096 + 1000; ++k) early = abs(at0[k] - slow[k]) > early ? abs(at0[k] - slow[k]) : early;
        for (unsigned k = N / 2 - 4096; k < N / 2; ++k) late = abs(at0[k] - slow[k]) > late ? abs(at0[k] - slow[k]) : late;
        printf("MORPH TIME 64: largest difference from TIME 0 in the first 23 ms %d, after 0.4 s %d\n", early, late);
        CHECK(early > 1000 && late < 4, "MORPH's crossfade (early %d, late %d)", early, late);
    }
    /* Levels and DC at middle C, defaults: the base oscillator of each model. */
    for (unsigned m = 0; m < WAVE_MODELS; ++m) {
        WaveControls c = wave_defaults[m];
        wave_reset(&w);
        hold(&w, &c, 60.0, buf, N);
        double rms, dc; int peak; stats(buf + 4410, N - 4410, &rms, &dc, &peak);
        printf("model %u at C4, defaults: rms %.3f (%.1f dBFS), peak %d (%.1f dBFS), dc %.4f\n", m, rms,
               20 * log10(rms), peak, 20 * log10(peak / 32768.0), dc);
        CHECK(fabs(dc) < 0.01, "model %u DC %.4f", m, dc);
        CHECK(peak < 32767, "model %u clips at defaults", m);
    }
    /* Full stack, DRIVE 127: dense but bounded. */
    {
        WaveControls c = wave_defaults[WAVE_SAW];
        c.det = 60, c.uni = c.wide = c.sub = c.sub2 = c.drive = 127;
        wave_reset(&w);
        hold(&w, &c, 36.0, buf, N);
        double rms, dc; int peak; stats(buf + 4410, N - 4410, &rms, &dc, &peak);
        printf("SAW full stack, DRIVE 127, C2: rms %.3f (%.1f dBFS), peak %d\n", rms, 20 * log10(rms), peak);
        CHECK(fabs(dc) < 0.02, "full stack DC %.4f", dc);
    }
    /* Aliasing: a saw at 3.52 kHz (A7) puts its first fold-back partial below the fundamental only through
     * aliasing; measure the energy below 3 kHz relative to the total by a simple DFT on bins. */
    {
        WaveControls c = wave_defaults[WAVE_SAW];
        wave_reset(&w);
        enum { L = 8192 };
        hold(&w, &c, 105.0, buf, L);
        double low = 0, all = 0;
        for (unsigned b = 1; b < L / 2; b += 1u) {
            double re = 0, im = 0, f = 2 * M_PI * b / L;
            for (unsigned k = 0; k < L; k += 1u) {
                double win = 0.5 - 0.5 * cos(2 * M_PI * k / (L - 1));
                re += buf[k] * win * cos(f * k), im -= buf[k] * win * sin(f * k);
            }
            double e = re * re + im * im, hz = (double)b * WAVE_RATE / L;
            all += e;
            if (hz > 100 && hz < 3000) low += e;
        }
        double db = 10 * log10(low / all);
        printf("SAW at A7 (3.52 kHz): energy below 3 kHz %.1f dB under the total (aliasing)\n", db);
        CHECK(db < -30, "aliasing too strong: %.1f dB", db);
    }
    printf(failures ? "%d FAILED\n" : "all checks pass\n", failures);
    return failures != 0;
}

/* ---- the listening set ------------------------------------------------------------------- */
static void put32(FILE *f, uint32_t v) { fputc(v & 255, f), fputc(v >> 8 & 255, f), fputc(v >> 16 & 255, f), fputc(v >> 24, f); }
static void put16(FILE *f, uint16_t v) { fputc(v & 255, f), fputc(v >> 8, f); }
static void wav(const char *dir, const char *name, const int16_t *b, unsigned n)
{
    char path[1024];
    snprintf(path, sizeof path, "%s/%s", dir, name);
    FILE *f = fopen(path, "wb");
    if (!f) { perror(path); exit(1); }
    fwrite("RIFF", 1, 4, f), put32(f, 36 + 2 * n), fwrite("WAVEfmt ", 1, 8, f), put32(f, 16), put16(f, 1), put16(f, 1);
    put32(f, WAVE_RATE), put32(f, 2 * WAVE_RATE), put16(f, 2), put16(f, 16), fwrite("data", 1, 4, f), put32(f, 2 * n);
    for (unsigned k = 0; k < n; ++k) put16(f, (uint16_t)b[k]);
    fclose(f);
    printf("%s\n", path);
}

/* A step sequence: notes (or -1 rests) at 16ths of tempo, a gate fraction of a step, the stand-in AMP:
 * 2 ms attack, then hold, then a release of rel seconds. */
static unsigned phrase(Wave *w, const WaveControls *c, const double *notes, unsigned steps, double bpm, double gate,
                       double rel, int16_t *out, unsigned cap)
{
    unsigned step = (unsigned)(WAVE_RATE * 60.0 / bpm / 4.0), n = steps * step + (unsigned)(rel * WAVE_RATE);
    if (n > cap) n = cap;
    double env = 0, note = notes[0];
    int16_t blk[16];
    for (unsigned at = 0; at < n; at += 16u) {
        unsigned s = at / step, pos = at % step, len = n - at < 16u ? n - at : 16u;
        int on = s < steps && notes[s] >= 0 && pos < gate * step;
        if (s < steps && notes[s] >= 0 && pos < 16u) note = notes[s], wave_note(w, c);
        wave_render(w, c, inc_of(note), blk, len);
        for (unsigned k = 0; k < len; ++k) {
            env = on ? fmin(1.0, env + 1.0 / (0.002 * WAVE_RATE)) : env * exp(-6.9 / (rel * WAVE_RATE));
            out[at + k] = (int16_t)lrint(blk[k] * env);
        }
    }
    return n;
}

static int render(const char *dir)
{
    enum { CAP = 44100 * 12 };
    static int16_t out[CAP];
    static Wave w;
    const double bass[16] = { 24, -1, 24, 36, -1, 24, 34, -1, 24, -1, 27, 24, -1, 31, 29, 27 };
    /* The same line an octave up for the stacked saws: from C1 their square sub sits at 16 Hz (the author, 27 Oct). */
    const double bass2[16] = { 36, -1, 36, 48, -1, 36, 46, -1, 36, -1, 39, 36, -1, 43, 41, 39 };
    const double lead[16] = { 60, 63, 67, 72, 70, 67, 63, 60, 58, 62, 65, 70, 67, 62, 58, 55 };
    const double pad[4] = { 48, 46, 44, 43 };
    unsigned n;

    WaveControls c = wave_defaults[WAVE_SAW];
    wave_reset(&w); n = phrase(&w, &c, bass, 16, 128, 0.6, 0.08, out, CAP); wav(dir, "01-saw-seul.wav", out, n);
    c.det = 40, c.uni = 127, c.wide = 90, c.sub = 90;
    wave_reset(&w); n = phrase(&w, &c, bass2, 16, 128, 0.6, 0.08, out, CAP); wav(dir, "02-saw-gras-sub.wav", out, n);
    c.drive = 110;
    wave_reset(&w); n = phrase(&w, &c, bass2, 16, 128, 0.6, 0.08, out, CAP); wav(dir, "03-saw-gras-drive.wav", out, n);
    c = wave_defaults[WAVE_SAW]; c.det = 30, c.uni = 100, c.wide = 60;
    wave_reset(&w); n = phrase(&w, &c, lead, 16, 128, 0.8, 0.2, out, CAP); wav(dir, "04-saw-lead.wav", out, n);

    c = wave_defaults[WAVE_PULSE];
    wave_reset(&w); n = phrase(&w, &c, bass, 16, 128, 0.6, 0.08, out, CAP); wav(dir, "05-pulse-carre.wav", out, n);
    c.pwm = 110, c.pws = 20, c.uni = 90, c.det = 50, c.sub2 = 70;
    wave_reset(&w); n = phrase(&w, &c, lead, 16, 128, 0.8, 0.2, out, CAP); wav(dir, "06-pulse-pwm.wav", out, n);
    c = wave_defaults[WAVE_PULSE]; c.pw = 118, c.sub = 100;
    wave_reset(&w); n = phrase(&w, &c, bass, 16, 128, 0.5, 0.06, out, CAP); wav(dir, "07-pulse-fin-sub.wav", out, n);

    c = wave_defaults[WAVE_ENS]; c.note[0] = 67, c.note[1] = 71, c.note[2] = 76, c.chor = 100;
    wave_reset(&w); n = phrase(&w, &c, pad, 4, 30, 0.95, 0.6, out, CAP); wav(dir, "08-ensemble-accord.wav", out, n);
    c.pw = 64, c.sub = 70;
    wave_reset(&w); n = phrase(&w, &c, pad, 4, 30, 0.95, 0.6, out, CAP); wav(dir, "09-ensemble-carre-sub.wav", out, n);
    c = wave_defaults[WAVE_ENS]; c.chor = 127;
    wave_reset(&w); n = phrase(&w, &c, lead, 16, 100, 0.9, 0.3, out, CAP); wav(dir, "10-ensemble-une-note.wav", out, n);

    /* TABLE: the 32 tables, one a note (C3, a quarter second each); a crossfade sweep; SYNC rising; a bass. */
    c = wave_defaults[WAVE_TABLE];
    wave_reset(&w);
    {
        unsigned step = WAVE_RATE / 4, len = 32 * step; int16_t blk[16];
        if (len > CAP) len = CAP;
        for (unsigned at = 0; at < len; at += 16u) {
            unsigned s = at / step, pos = at % step;
            c.table = (uint8_t)(s * 4);
            wave_render(&w, &c, inc_of(48), blk, 16);
            for (unsigned k = 0; k < 16u && at + k < len; ++k) {
                double env = pos + k < 220 ? (pos + k) / 220.0 : pos + k > step - 600 ? (step - pos - k) / 600.0 : 1.0;
                out[at + k] = (int16_t)lrint(blk[k] * env);
            }
        }
        wav(dir, "11-table-les-32-formes.wav", out, len);
    }
    c = wave_defaults[WAVE_TABLE]; c.table = 32, c.msweep = 12;
    wave_reset(&w); n = phrase(&w, &c, pad, 4, 30, 0.95, 0.6, out, CAP); wav(dir, "12-table-fondu-balaye.wav", out, n);
    c = wave_defaults[WAVE_TABLE]; c.table = 8;
    wave_reset(&w);
    {
        unsigned len = 44100 * 6; int16_t blk[16];
        for (unsigned at = 0; at < len; at += 16u) {
            c.sync = (uint8_t)(at * 127u / len);
            wave_render(&w, &c, inc_of(48), blk, 16);
            for (unsigned k = 0; k < 16u; ++k) out[at + k] = blk[k];
        }
        wav(dir, "13-table-sync-montant.wav", out, len);
    }
    c = wave_defaults[WAVE_TABLE]; c.table = 64, c.sub = 80;
    wave_reset(&w); n = phrase(&w, &c, bass2, 16, 128, 0.6, 0.08, out, CAP); wav(dir, "14-table-basse-escalier-sub.wav", out, n);

    /* MORPH: MIX from SAW to DSAW; a fifth above with WID; TIME's crossfade between four cycles; BIT1 falling. */
    c = wave_defaults[WAVE_MORPH];
    wave_reset(&w);
    {
        unsigned len = 44100 * 6; int16_t blk[16];
        for (unsigned at = 0; at < len; at += 16u) {
            c.mix = (uint8_t)(at * 127u / len);
            wave_render(&w, &c, inc_of(48), blk, 16);
            for (unsigned k = 0; k < 16u; ++k) out[at + k] = blk[k];
        }
        wav(dir, "15-morph-mix-saw-dsaw.wav", out, len);
    }
    c = wave_defaults[WAVE_MORPH]; c.wav2 = 8, c.mix = 50, c.wid = 69;   /* 69: +7.1 semitones */
    wave_reset(&w); n = phrase(&w, &c, lead, 16, 128, 0.8, 0.2, out, CAP); wav(dir, "16-morph-quinte-wid.wav", out, n);
    c = wave_defaults[WAVE_MORPH]; c.mix = 0, c.fade = 90;
    wave_reset(&w);
    {
        const uint8_t cycles[4] = { 8, 108, 52, 80 };       /* SAW, VOWA, BELL, FLD4 */
        unsigned len = 44100 * 4; int16_t blk[16];
        for (unsigned at = 0; at < len; at += 16u) {
            c.table = cycles[at / 44100u];
            wave_render(&w, &c, inc_of(48), blk, 16);
            for (unsigned k = 0; k < 16u; ++k) out[at + k] = blk[k];
        }
        wav(dir, "17-morph-time-saw-vowa-bell-fld4.wav", out, len);
    }
    c = wave_defaults[WAVE_MORPH]; c.mix = 0;
    wave_reset(&w);
    {
        unsigned len = 44100 * 6; int16_t blk[16];
        for (unsigned at = 0; at < len; at += 16u) {
            c.bit1 = (uint8_t)(at * 127u / len);
            wave_render(&w, &c, inc_of(36), blk, 16);
            for (unsigned k = 0; k < 16u; ++k) out[at + k] = blk[k];
        }
        wav(dir, "18-morph-bit1-12-a-1-bit.wav", out, len);
    }

    /* CHOIR: a VOWA chord, then one voice with the chorus wide open, then a BELL chord over SUB. */
    c = wave_defaults[WAVE_CHOIR]; c.note[0] = 67, c.note[1] = 71, c.note[2] = 76, c.chor = 100;
    wave_reset(&w); n = phrase(&w, &c, pad, 4, 30, 0.95, 0.6, out, CAP); wav(dir, "19-choir-accord-vowa.wav", out, n);
    c = wave_defaults[WAVE_CHOIR]; c.chor = 127;
    wave_reset(&w); n = phrase(&w, &c, lead, 16, 100, 0.9, 0.3, out, CAP); wav(dir, "20-choir-une-note.wav", out, n);
    c = wave_defaults[WAVE_CHOIR]; c.table = 52, c.note[0] = 71, c.note[1] = 76, c.sub = 70;
    wave_reset(&w); n = phrase(&w, &c, pad, 4, 30, 0.95, 0.6, out, CAP); wav(dir, "21-choir-bell-sub.wav", out, n);
    return 0;
}

int main(int argc, char **argv)
{
    if (argc >= 2 && !strcmp(argv[1], "check")) return check();
    if (argc >= 3 && !strcmp(argv[1], "render")) return render(argv[2]);
    fprintf(stderr, "usage: %s check | render <dir>\n", argv[0]);
    return 2;
}

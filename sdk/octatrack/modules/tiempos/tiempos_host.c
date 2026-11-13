/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host de pruebas de TIEMPOS: memoria del OS simulada, reloj de 132 MHz simulado,
 * 60 ticks por segundo, y volcado de la pantalla a PBM.
 *
 *   cc -DDECK_HOST -I.. -o tiempos_host tiempos_host.c ../tiempos.c && ./tiempos_host out/
 */
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <stdlib.h>
#include "modwerk_module.h"
#include "ot_state.h"
#include "deck_keys.h"
#include "deck_font.h"

static double now_s;              /* tiempo real simulado */
static uint8_t active[8], cur;
static double pos[8], speed[8];   /* frames, frames por segundo (negativa: hacia atrás) */
static uint32_t start[8], len[8]; /* trim de cada voz, frames */
static int redraws, fails;

uint32_t host_rd32(uint32_t a)
{
    if (a == OT_DTCN3) return (uint32_t)(uint64_t)llround(now_s * 132e6);
    for (unsigned t = 0; t < 8; ++t) {
        uint32_t v = OT_VOICE_BASE + t * OT_VOICE_STRIDE;
        if (a == v + OT_VOICE_POS) return (uint32_t)(int32_t)llround(pos[t]); /* hacia atrás llega a -1 */
        if (a == v + OT_VOICE_START) return start[t];
        if (a == v + OT_VOICE_END) return len[t];
    }
    return 0;
}
uint16_t host_rd16(uint32_t a) { (void)a; return 0; }
uint8_t host_rd8(uint32_t a)
{
    if (a == OT_CUR_TRACK) return cur;
    for (unsigned t = 0; t < 8; ++t)
        if (a == OT_VOICE_BASE + t * OT_VOICE_STRIDE + OT_VOICE_ACTIVE) return active[t];
    return 0;
}
void host_redraw(void) { ++redraws; }

#define BAR_TEST_X0 13 /* BAR_X0 de tiempos.c */
static unsigned char frame[1024];
static int pixel(int x, int y) { return (frame[x * 8 + 7 - (y >> 3)] >> (y & 7)) & 1; }
static void check(int ok, const char *what) { printf("%s  %s\n", ok ? "OK  " : "FALLO", what); if (!ok) ++fails; }

static void run(double secs)
{
    int n = (int)lround(secs * 60.0);
    for (int i = 0; i < n; ++i) {
        now_s += 1.0 / 60.0;
        for (int t = 0; t < 8; ++t)
            if (active[t]) {
                pos[t] += speed[t] / 60.0;
                if (pos[t] >= len[t]) pos[t] = len[t], active[t] = 0;
                /* hacia atrás, como en la MKI: se queda en el frame anterior al inicio, activa */
                if (speed[t] < 0 && pos[t] < start[t]) pos[t] = (double)start[t] - 1;
            }
        module_tick(0);
    }
}
static void draw(void) { memset(frame, 0xA5, sizeof frame); module_draw(frame); }
static void key(int c, int p) { (void)module_key(c, p); }

static void dump(const char *dir, const char *name)
{
    char path[512];
    snprintf(path, sizeof path, "%s/%s.pbm", dir, name);
    FILE *f = fopen(path, "wb");
    fprintf(f, "P1\n128 64\n");
    for (int y = 0; y < 64; ++y) { for (int x = 0; x < 128; ++x) fputc(pixel(x, y) ? '1' : '0', f); fputc('\n', f); }
    fclose(f);
}

/* Lee los 5 caracteres de una zona comparando con la fuente: lo hace sencillo
 * reconstruir "m:ss" contando la anchura del texto encendido no basta, así que las
 * pruebas de valores miran el estado interno a través de api->value y la pantalla. */
static int lit_in(int x0, int x1, int y0, int y1)
{
    int n = 0;
    for (int x = x0; x <= x1; ++x) for (int y = y0; y <= y1; ++y) n += pixel(x, y);
    return n;
}

/* ¿Muestra la zona que acaba en x_end, en la fila y, exactamente el texto s? */
static int text_at(int x_end, int y, const char *s)
{
    int n = (int)strlen(s), x0 = x_end - (n * 4 - 1) + 1;
    for (int x = x0 - 2; x <= x_end; ++x) /* x0 - 2: no llega al tope de la barra */
        for (int r = 0; r < 5; ++r) {
            int want = 0, k = x - x0;
            if (k >= 0 && k % 4 < 3) {
                int c = (unsigned char)s[k / 4];
                want = (deck_font[c - 32] >> (14 - r * 3 - k % 4)) & 1;
            }
            if (pixel(x, y + 1 + r) != want) return 0;
        }
    return 1;
}
static void mmss(char *s, unsigned secs) { snprintf(s, 8, "%u:%02u", secs / 60, secs % 60); }

int main(int argc, char **argv)
{
    const char *out = argc > 1 ? argv[1] : ".";
    const double R = 44100.0;

    /* T1: tema de 10:52 a 126 BPM en proyecto a 128 (time-stretch: avanza 128/126 más rápido) */
    len[0] = (uint32_t)(652 * R); pos[0] = 200 * R; speed[0] = R * 128.0 / 126.0; active[0] = 1;
    /* T2: tema de 6:30 a su tempo, trim desde los 30 s, a 25 s del final */
    start[1] = (uint32_t)(30 * R); len[1] = (uint32_t)(390 * R); pos[1] = (390 - 25) * R; speed[1] = R; active[1] = 1;
    /* T3: cargado y parado, con el trim empezando a los 10 s (la posición aún no ha llegado) */
    start[2] = (uint32_t)(10 * R); len[2] = (uint32_t)(300 * R); pos[2] = 0; speed[2] = R; active[2] = 0;
    /* T4: loop corto de flex que retriguea */
    len[3] = (uint32_t)(4 * R); pos[3] = 0; speed[3] = R; active[3] = 1;
    /* T5-T8 vacías; pista seleccionada: T1 */
    cur = 0;

    run(0.2);
    draw();
    int untouched = 1;
    for (int i = 0; i < 1024; ++i) untouched &= frame[i] == 0xA5;
    check(untouched, "cerrado: el marco del OS queda intacto");

    key(K_CUE, 1);
    check(module_key(K_MIDI, 1) == 1, "CUE + MIDI abre y se queda la pulsación");
    key(K_MIDI, 0); key(K_CUE, 0);
    run(2.0);

    /* tiempo restante real de T1 */
    {
        struct modwerk_runtime_api api = {0};
        module_tick(&api);
        double rate = api.value, want = R * 128.0 / 126.0;
        check(fabs(rate - want) / want < 0.002, "T1: velocidad medida = 44100 x 128/126 (error < 0,2 %)");
        double rem_true = (len[0] - pos[0]) / want, rem_naive = (len[0] - pos[0]) / R;
        printf("      T1 restante real %.1f s (sin corregir serían %.1f s)\n", rem_true, rem_naive);
    }
    draw();
    dump(out, "t1_ocho_pistas");
    check(lit_in(0, 8, 0, 6) > 40, "T1 suena: número relleno");
    check(pixel(10, 3), "marca de pista seleccionada en T1");
    check(pixel(0, 16) && pixel(8, 22) && !pixel(1, 17), "T3 cargada y parada: contorno");
    check(pixel(0, 32) && !pixel(1, 32), "T5 vacía: punteada");
    check(lit_in(84, 103, 32, 38) > 10, "T5 vacía: muestra --:--");

    /* parpadeo de T2 (< 30 s) */
    int a, b;
    run(0.25); draw(); a = lit_in(83, 104, 8, 14);
    run(0.5); draw(); b = lit_in(83, 104, 8, 14);
    check(abs(a - b) > 30, "T2: el tiempo parpadea por debajo de 30 s");

    /* cambio de tempo del proyecto a 132: la medida se adapta en menos de 2 s */
    speed[0] = R * 132.0 / 126.0;
    run(2.0);
    {
        struct modwerk_runtime_api api = {0};
        module_tick(&api);
        double want = R * 132.0 / 126.0;
        check(fabs(api.value - want) / want < 0.002, "cambio de tempo: nueva velocidad en < 2 s");
    }

    /* retrig del loop de T4: no rompe la medida */
    for (int i = 0; i < 5; ++i) { pos[3] = 0; run(0.3); }
    draw();
    check(lit_in(84, 127, 24, 30) > 10, "T4 con retrigs: sigue mostrando tiempos");

    /* LEFT: columna derecha a transcurrido */
    key(K_LEFT, 1); key(K_LEFT, 0);
    draw();
    dump(out, "t2_transcurrido");

    /* PLAY no se toma; SRC cierra y pide redibujar */
    check(module_key(K_PLAY, 1) == 0, "PLAY sigue al OS");
    module_key(K_PLAY, 0);
    int r0 = redraws;
    check(module_key(K_SRC, 1) == 0 && redraws == r0 + 1, "SRC cierra y el OS redibuja");
    module_key(K_SRC, 0);

    /* Teclas de pista con la pantalla abierta: llegan siempre al OS; una sola deja la
     * pantalla, dos de la misma pista en menos de 400 ms la cierran. */
    key(K_CUE, 1); key(K_MIDI, 1); key(K_MIDI, 0); key(K_CUE, 0);
    int pass = module_key(K_TRACK1 + 2, 1) == 0; module_key(K_TRACK1 + 2, 0);
    run(0.5);
    pass &= module_key(K_TRACK1 + 2, 1) == 0; module_key(K_TRACK1 + 2, 0);
    draw();
    check(pass && frame[0] != 0xA5, "T3 dos veces con 500 ms entre medias: llega al OS y la pantalla sigue");
    pass = module_key(K_TRACK1 + 3, 1) == 0; module_key(K_TRACK1 + 3, 0);
    run(0.2);
    pass &= module_key(K_TRACK1 + 2, 1) == 0; module_key(K_TRACK1 + 2, 0);
    draw();
    check(pass && frame[0] != 0xA5, "T4 y luego T3 en 200 ms: llegan al OS y la pantalla sigue");
    r0 = redraws;
    run(0.25);
    pass = module_key(K_TRACK1 + 2, 1) == 0; module_key(K_TRACK1 + 2, 0);
    draw();
    check(pass && frame[0] == 0xA5 && redraws == r0 + 1, "T3 dos veces en 250 ms: llega al OS, cierra y el OS redibuja");

    /* RATE negativo (MKI, 2 de noviembre): la posición baja, se queda en -1 en el inicio y un
     * redisparo salta al final. T1 sigue sonando hacia delante a 132/126. */
    key(K_CUE, 1); key(K_MIDI, 1); key(K_MIDI, 0); key(K_CUE, 0);
    key(K_LEFT, 1); key(K_LEFT, 0); /* la columna derecha vuelve a la duración total */
    double fwd = R * 132.0 / 126.0;
    speed[0] = -fwd;
    run(2.0);
    {
        struct modwerk_runtime_api api = {0};
        module_tick(&api);
        int32_t r = (int32_t)api.value;
        check(r < 0 && fabs(-r - fwd) / fwd < 0.002, "de RATE positivo a negativo sonando: velocidad negativa en < 2 s");
    }
    draw();
    dump(out, "t3_hacia_atras");
    char want[8], less[8];
    unsigned rem = (unsigned)((pos[0] - start[0]) / fwd);
    mmss(want, rem), mmss(less, rem ? rem - 1 : 0);
    check(text_at(103, 0, want) || text_at(103, 0, less), "hacia atrás: el restante es lo que queda hasta el inicio del trim");
    mmss(want, (unsigned)((len[0] - start[0]) / fwd));
    check(text_at(127, 0, want), "hacia atrás: el total no cambia");
    check(pixel(BAR_TEST_X0 + 1, 1) && !pixel(79, 1) && pixel(79, 3), "hacia atrás: la barra maciza queda a la izquierda");

    /* redisparo de la pista invertida: salta al final y sigue hacia atrás sin perder la medida */
    pos[0] = len[0] - 60 * R;
    run(0.1);
    {
        struct modwerk_runtime_api api = {0};
        module_tick(&api);
        check((int32_t)api.value < 0, "redisparo de una pista invertida: sigue midiendo hacia atrás");
    }
    draw();
    rem = (unsigned)((pos[0] - start[0]) / fwd);
    mmss(want, rem), mmss(less, rem - 1);
    check(text_at(103, 0, want) || text_at(103, 0, less), "redisparo de una pista invertida: el restante vuelve a contar desde el final");

    /* llega al inicio: 0:00 fijo, sin parpadeo */
    pos[0] = start[0] + 0.5 * R;
    run(1.5);
    draw(); a = text_at(103, 0, "0:00");
    run(0.5); draw(); b = text_at(103, 0, "0:00");
    check(pos[0] < 0 && a && b, "hacia atrás al llegar al inicio (-1): 0:00 sin parpadeo");

    /* RATE 0: la voz quieta no inventa un tiempo */
    pos[0] = 300 * R, speed[0] = 0;
    run(1.5);
    draw();
    check(text_at(103, 0, "--:--") && text_at(127, 0, "--:--"), "RATE 0: --:-- en el restante y en el total");

    printf("\n%d fallo(s)\n", fails);
    return fails != 0;
}

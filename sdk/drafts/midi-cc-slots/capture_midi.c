/* SPDX-License-Identifier: MIT
 * macOS passive MIDI recorder. Creates input ports only; never sends MIDI.
 * clang capture_midi.c -framework CoreMIDI -framework CoreFoundation -o /private/local/capture-midi
 * capture-midi NEW-PRIVATE.jsonl 60 > NEW-PRIVATE-summary.json
 * Raw packet bytes stay private. Counts alone cannot prove delivery or no loss.
 */
#include <CoreMIDI/CoreMIDI.h>
#include <CoreFoundation/CoreFoundation.h>
#include <mach/mach_time.h>
#include <pthread.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>
#include <sys/stat.h>

struct source {
    char name[256];
    unsigned status, used, data[2], sysex;
    unsigned long bytes, packets, clocks, starts, stops, notes_on, notes_off, cc;
    unsigned long channels[16], controllers[128];
    unsigned char active[16][128];
};
static struct source sources[16];
static FILE *raw;
static pthread_mutex_t lock = PTHREAD_MUTEX_INITIALIZER;
static volatile sig_atomic_t interrupted;
static void stop(int sig) { (void)sig; interrupted = 1; }

static void byte(struct source *s, unsigned b) {
    if (b >= 0xf8) {
        if (b == 0xf8) s->clocks++;
        if (b == 0xfa) s->starts++;
        if (b == 0xfc) s->stops++;
        return;
    }
    if (b & 128) {
        s->used = 0;
        if (b == 0xf0) { s->sysex = 1; s->status = 0; return; }
        if (b == 0xf7) { s->sysex = 0; s->status = 0; return; }
        s->status = b;
        return;
    }
    if (s->sysex || !s->status) return;
    unsigned kind = s->status & 0xf0, ch = s->status & 15;
    unsigned n = (kind == 0xc0 || kind == 0xd0 || s->status == 0xf1 || s->status == 0xf3) ? 1 : 2;
    if (s->used >= 2) { s->used = 0; return; }
    s->data[s->used++] = b;
    if (s->used != n) return;
    s->used = 0;
    if (kind == 0xf0) { s->status = 0; return; }
    s->channels[ch]++;
    if (kind == 0x90 && s->data[1]) { s->notes_on++; s->active[ch][s->data[0]] = 1; }
    if (kind == 0x80 || (kind == 0x90 && !s->data[1])) { s->notes_off++; s->active[ch][s->data[0]] = 0; }
    if (kind == 0xb0) {
        s->cc++; s->controllers[s->data[0]]++;
        if (s->data[0] == 120 || s->data[0] == 123) memset(s->active[ch], 0, 128);
    }
}
static void receive(const MIDIPacketList *list, void *context, void *connection) {
    (void)context;
    struct source *s = connection;
    pthread_mutex_lock(&lock);
    const MIDIPacket *p = &list->packet[0];
    for (UInt32 i = 0; i < list->numPackets; i++, p = MIDIPacketNext(p)) {
        s->packets++; s->bytes += p->length;
        fprintf(raw, "{\"source\":%ld,\"hostTicks\":%llu,\"receivedTicks\":%llu,\"hex\":\"",
                (long)(s - sources), (unsigned long long)p->timeStamp, (unsigned long long)mach_absolute_time());
        for (unsigned j = 0; j < p->length; j++) { fprintf(raw, "%02x", p->data[j]); byte(s, p->data[j]); }
        fputs("\"}\n", raw);
    }
    pthread_mutex_unlock(&lock);
}
static void json_string(const char *p) {
    putchar('"');
    for (; *p; p++) {
        unsigned b = (unsigned char)*p;
        if (b == '"' || b == '\\') putchar('\\');
        if (b < 32) printf("\\u%04x", b); else putchar(b);
    }
    putchar('"');
}
static int selftest(void) {
    struct source s = {0};
    unsigned char sequence[] = {0x95,60,100,0xf8,61,100,0xb5,0,0,127,127,0x95,60,0,0x85,61,0};
    for (unsigned i = 0; i < sizeof sequence; i++) byte(&s, sequence[i]);
    assert(s.notes_on == 2 && s.notes_off == 2 && s.clocks == 1 && s.cc == 2);
    assert(s.controllers[0] == 1 && s.controllers[127] == 1 && s.channels[5] == 6);
    assert(!s.active[5][60] && !s.active[5][61]);
    unsigned char sysex[] = {0xf0,1,2,0xf8,3,0xf7,0x90,64,100,0xb0,123,0};
    for (unsigned i = 0; i < sizeof sysex; i++) byte(&s, sysex[i]);
    assert(s.clocks == 2 && s.notes_on == 3 && !s.active[0][64]);
    puts("Running status, interleaved clock, CC endpoints, channel 6, note-off/zero velocity, SysEx and all-notes-off passed.");
    return 0;
}
int main(int argc, char **argv) {
    if (argc == 2 && !strcmp(argv[1], "--selftest")) return selftest();
    if (argc != 3) { fputs("Usage: capture-midi NEW-PRIVATE.jsonl SECONDS (1-120)\n", stderr); return 2; }
    char *end;
    long seconds = strtol(argv[2], &end, 10);
    if (*end || seconds < 1 || seconds > 120) return 2;
    ItemCount count = MIDIGetNumberOfSources();
    if (!count || count > 16) { fputs("No MIDI inputs, or more than 16: select ports explicitly.\n", stderr); return 2; }
    raw = fopen(argv[1], "wx");
    if (!raw) { perror("New private packet log"); return 2; }
    if (fchmod(fileno(raw), S_IRUSR | S_IWUSR)) { fclose(raw); return 2; }
    MIDIClientRef client = 0; MIDIPortRef input = 0;
    if (MIDIClientCreate(CFSTR("Midi Mode 2 passive measurement"), NULL, NULL, &client) ||
        MIDIInputPortCreate(client, CFSTR("Read only"), receive, NULL, &input)) return 1;
    for (ItemCount i = 0; i < count; i++) {
        MIDIEndpointRef endpoint = MIDIGetSource(i); CFStringRef name = NULL;
        MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name);
        if (name) { CFStringGetCString(name, sources[i].name, sizeof sources[i].name, kCFStringEncodingUTF8); CFRelease(name); }
        if (MIDIPortConnectSource(input, endpoint, &sources[i])) return 1;
        fprintf(stderr, "Listening to input %lu: %s\n", (unsigned long)i, sources[i].name);
    }
    signal(SIGINT, stop); signal(SIGTERM, stop);
    mach_timebase_info_data_t scale; mach_timebase_info(&scale);
    uint64_t start = mach_absolute_time();
    double elapsed = 0;
    while (!interrupted && elapsed < seconds) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.25, false);
        elapsed = (double)(mach_absolute_time() - start) * scale.numer / scale.denom / 1e9;
    }
    MIDIPortDispose(input); MIDIClientDispose(client);
    pthread_mutex_lock(&lock);
    int failed = ferror(raw); if (fclose(raw)) failed = 1;
    printf("{\"qualification\":false,\"elapsedSeconds\":%.3f,\"rawLogWriteError\":%s,\"sources\":[", elapsed, failed ? "true" : "false");
    for (ItemCount i = 0; i < count; i++) {
        struct source *s = &sources[i]; unsigned active = 0;
        for (unsigned ch = 0; ch < 16; ch++) for (unsigned key = 0; key < 128; key++) active += s->active[ch][key];
        if (i) putchar(','); fputs("{\"name\":", stdout); json_string(s->name);
        printf(",\"bytes\":%lu,\"packets\":%lu,\"clocks\":%lu,\"starts\":%lu,\"stops\":%lu,\"noteOn\":%lu,\"noteOff\":%lu,\"cc\":%lu,\"activeKeysAtEnd\":%u,\"channelMessages\":[",
               s->bytes, s->packets, s->clocks, s->starts, s->stops, s->notes_on, s->notes_off, s->cc, active);
        for (unsigned ch = 0; ch < 16; ch++) printf("%s%lu", ch ? "," : "", s->channels[ch]);
        fputs("],\"controllerMessages\":[", stdout);
        for (unsigned cc = 0; cc < 128; cc++) printf("%s%lu", cc ? "," : "", s->controllers[cc]);
        fputs("]}", stdout);
    }
    puts("],\"limitations\":[\"Passive input capture; no MIDI sent.\",\"No known expected sequence: dropped messages and host/interface loss are unmeasured.\",\"Active-key flags do not establish audible stuck notes or distinguish overlapping same-pitch voices.\"]}");
    pthread_mutex_unlock(&lock);
    return failed ? 1 : 0;
}

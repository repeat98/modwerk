/* SPDX-License-Identifier: MIT
 * The macOS CoreMIDI stream used in the Grain timing comparison.
 * Sends to the named OT only. Calling with no argument prints usage.
 */
#include <CoreAudio/HostTime.h>
#include <CoreMIDI/CoreMIDI.h>
#include <mach/mach_time.h>
#include <stdio.h>
#include <string.h>

static MIDIEndpointRef octatrack(void)
{
    MIDIEndpointRef found = 0;
    for (ItemCount i = 0; i < MIDIGetNumberOfDestinations(); ++i) {
        MIDIEndpointRef endpoint = MIDIGetDestination(i);
        CFStringRef name = NULL;
        if (MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &name) || !name) continue;
        int matches = CFEqual(name, CFSTR("Elektron Octatrack DPS-1"));
        CFRelease(name);
        if (matches) {
            if (found) return 0;
            found = endpoint;
        }
    }
    return found;
}

static int send_at(MIDIPortRef port, MIDIEndpointRef endpoint, uint64_t time, const Byte *bytes, unsigned len)
{
    MIDIPacketList list;
    MIDIPacket *first = MIDIPacketListInit(&list);
    return MIDIPacketListAdd(&list, sizeof list, first, time, len, bytes) && !MIDISend(port, endpoint, &list);
}

int main(int argc, char **argv)
{
    if (argc != 2 || strcmp(argv[1], "--send")) {
        fprintf(stderr, "Usage: midi_trace --send (12 seconds on Elektron Octatrack DPS-1)\n");
        return 2;
    }
    MIDIClientRef client;
    MIDIPortRef port;
    MIDIEndpointRef endpoint = octatrack();
    if (!endpoint || MIDIClientCreate(CFSTR("Grain timing"), NULL, NULL, &client) ||
        MIDIOutputPortCreate(client, CFSTR("Grain timing out"), &port)) return 1;

    const uint64_t start = AudioGetCurrentHostTime() + AudioConvertNanosToHostTime(150000000);
    unsigned channel_messages = 0, clocks = 0, stops = 0;
    while (channel_messages < 12u * 1008u || clocks < 12u * 96u) {
        int clock = clocks < 12u * 96u && clocks * 1008u <= channel_messages * 96u;
        uint64_t ns;
        unsigned len;
        Byte bytes[3];
        if (clock) {
            ns = (uint64_t)clocks++ * 1000000000u / 96u;
            bytes[0] = 0xf8;
            len = 1;
        } else {
            ns = (uint64_t)channel_messages * 1000000000u / 1008u;
            unsigned group = channel_messages / 42, offset = channel_messages % 42;
            unsigned channel = (group % 2) * 4, note = 72 + group % 12;
            if (offset == 0) {
                bytes[0] = 0x90 | channel; bytes[1] = note; bytes[2] = 82 + group % 22;
            } else if (offset == 24) {
                bytes[0] = 0x80 | channel; bytes[1] = note; bytes[2] = 0;
            } else {
                bytes[0] = 0xb0 | channel; bytes[1] = 119; bytes[2] = (channel_messages * 7u) & 127;
            }
            channel_messages++;
            len = 3;
        }
        uint64_t at = start + AudioConvertNanosToHostTime(ns);
        mach_wait_until(at - AudioConvertNanosToHostTime(10000000));
        if (!send_at(port, endpoint, at, bytes, len)) return 1;
        if (!clock && channel_messages == 6u * 1008u + 12u && !stops) {
            const Byte stop = 0xfc;
            if (!send_at(port, endpoint, at + 1, &stop, 1)) return 1;
            stops++;
        }
    }
    mach_wait_until(start + AudioConvertNanosToHostTime(12000000000ull));
    MIDIPortDispose(port);
    MIDIClientDispose(client);
    printf("Submitted %u channel messages, %u clocks, %u STOP.\n", channel_messages, clocks, stops);
    return 0;
}

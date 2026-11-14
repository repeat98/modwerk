// Offline black-box host for the user's installed Amigo AU (aumu Amgo PTNZ). No GUI, no code inspection.
// host list | host state out.plist | host render [--state in.plist] [--set id value]... [--note n] [--pitch-hold s] --seconds s --out stereo_f32.raw
#include <AudioToolbox/AudioToolbox.h>
#include <CoreFoundation/CoreFoundation.h>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>
static void check(OSStatus s, const char* w) { if (s) { fprintf(stderr, "%s: %d\n", w, int(s)); exit(1); } }
int main(int argc, char** argv) {
    std::string mode = argc > 1 ? argv[1] : "list", state, out; double seconds = 2, hold = 1.5; int note = 60;
    std::vector<std::pair<AudioUnitParameterID, float>> sets;
    for (int i = 2; i < argc; ++i) { std::string a = argv[i];
        if (a == "--state") state = argv[++i]; else if (a == "--out") out = argv[++i];
        else if (a == "--seconds") seconds = atof(argv[++i]); else if (a == "--hold") hold = atof(argv[++i]);
        else if (a == "--note") note = atoi(argv[++i]);
        else if (a == "--set") { auto id = AudioUnitParameterID(strtoul(argv[i + 1], 0, 0)); sets.push_back({id, float(atof(argv[i + 2]))}); i += 2; }
        else if (mode == "state" && out.empty()) out = a; }
    AudioComponentDescription d = {kAudioUnitType_MusicDevice, 'Amgo', 'PTNZ', 0, 0};
    AudioComponent c = AudioComponentFindNext(nullptr, &d);
    if (!c) { fprintf(stderr, "Amigo AU not found\n"); return 1; }
    AudioUnit u; check(AudioComponentInstanceNew(c, &u), "new");
    AudioStreamBasicDescription f = {44100, kAudioFormatLinearPCM, kAudioFormatFlagsNativeFloatPacked | kAudioFormatFlagIsNonInterleaved, 4, 1, 4, 2, 32, 0};
    check(AudioUnitSetProperty(u, kAudioUnitProperty_StreamFormat, kAudioUnitScope_Output, 0, &f, sizeof f), "format");
    UInt32 maxf = 512; AudioUnitSetProperty(u, kAudioUnitProperty_MaximumFramesPerSlice, kAudioUnitScope_Global, 0, &maxf, sizeof maxf);
    check(AudioUnitInitialize(u), "init");
    if (!state.empty()) {
        CFURLRef url = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)state.c_str(), state.size(), false);
        CFReadStreamRef rs = CFReadStreamCreateWithFile(nullptr, url); CFReadStreamOpen(rs);
        CFPropertyListRef pl = CFPropertyListCreateWithStream(nullptr, rs, 0, kCFPropertyListImmutable, nullptr, nullptr);
        if (!pl) { fprintf(stderr, "bad state\n"); return 1; }
        check(AudioUnitSetProperty(u, kAudioUnitProperty_ClassInfo, kAudioUnitScope_Global, 0, &pl, sizeof pl), "set state");
    }
    for (auto& s : sets) check(AudioUnitSetParameter(u, s.first, kAudioUnitScope_Global, 0, s.second, 0), "set");
    if (mode == "list") {
        UInt32 size = 0; AudioUnitGetPropertyInfo(u, kAudioUnitProperty_ParameterList, kAudioUnitScope_Global, 0, &size, nullptr);
        std::vector<AudioUnitParameterID> ids(size / sizeof(AudioUnitParameterID));
        AudioUnitGetProperty(u, kAudioUnitProperty_ParameterList, kAudioUnitScope_Global, 0, ids.data(), &size);
        for (auto id : ids) { AudioUnitParameterInfo info; UInt32 n = sizeof info;
            AudioUnitGetProperty(u, kAudioUnitProperty_ParameterInfo, kAudioUnitScope_Global, id, &info, &n);
            char name[256] = {}; if (info.cfNameString) CFStringGetCString(info.cfNameString, name, 256, kCFStringEncodingUTF8);
            AudioUnitParameterValue v; AudioUnitGetParameter(u, id, kAudioUnitScope_Global, 0, &v);
            printf("%u\t%s\t%g..%g\t=%g\n", unsigned(id), name, info.minValue, info.maxValue, v); }
        return 0;
    }
    if (mode == "state") {
        CFPropertyListRef pl = nullptr; UInt32 n = sizeof pl;
        check(AudioUnitGetProperty(u, kAudioUnitProperty_ClassInfo, kAudioUnitScope_Global, 0, &pl, &n), "get state");
        CFDataRef data = CFPropertyListCreateData(nullptr, pl, kCFPropertyListXMLFormat_v1_0, 0, nullptr);
        FILE* fp = fopen(out.c_str(), "wb"); fwrite(CFDataGetBytePtr(data), 1, CFDataGetLength(data), fp); fclose(fp);
        return 0;
    }
    FILE* fp = fopen(out.c_str(), "wb"); if (!fp) return 1;
    std::vector<float> l(512), r(512), inter(1024);
    struct { AudioBufferList list; AudioBuffer second; } b;
    AudioTimeStamp ts = {}; ts.mFlags = kAudioTimeStampSampleTimeValid;
    long total = long(seconds * 44100), off = long(hold * 44100), warm = 44100; // a second of silence first: the sample loads
    bool on = false, released = false;
    for (long at = -warm; at < total; at += 512) {
        if (at >= 0 && !on) { MusicDeviceMIDIEvent(u, 0x90, note, 100, 0); on = true; }
        if (at >= off && !released) { MusicDeviceMIDIEvent(u, 0x80, note, 0, 0); released = true; }
        b.list.mNumberBuffers = 2;
        b.list.mBuffers[0] = {1, 512 * 4, l.data()}; b.list.mBuffers[1] = {1, 512 * 4, r.data()};
        AudioUnitRenderActionFlags flags = 0;
        check(AudioUnitRender(u, &flags, &ts, 0, 512, &b.list), "render");
        ts.mSampleTime += 512;
        if (at < 0) continue;
        float* pl = (float*)b.list.mBuffers[0].mData; float* pr = (float*)b.list.mBuffers[1].mData;
        for (int i = 0; i < 512; ++i) inter[2 * i] = pl[i], inter[2 * i + 1] = pr[i];
        fwrite(inter.data(), 4, 1024, fp);
    }
    fclose(fp); return 0;
}

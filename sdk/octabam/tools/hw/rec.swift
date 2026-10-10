// Drop-free recorder for an interface chosen by name (EVO4, MicroBook, ...): CoreAudio device lookup,
// raw HAL IOProc -> int32 PCM wav (all input channels).
// usage: rec <seconds> <out.wav> [device-substring]   Prints "START <epoch>" once live.
//
// Why the HAL and not AVAudioEngine (13 Sep 2026): AVAudioEngine fixes its input node's
// graph format from the SYSTEM DEFAULT input device when the engine is created, and
// re-pointing the AUHAL at the interface afterwards changes only the hardware side. With
// a Bluetooth headset as the default input (16 kHz mono HFP) the engine reported the
// MicroBook's 44.1 kHz / 6 ch, started, and delivered ZERO frames -- from every device,
// sandbox on or off, mic permission granted. A raw IOProc on the device itself ran 173
// cycles x 512 frames in 2 s with signal on ch 3/4. Nothing here depends on a default device.
import CoreAudio
import Foundation

let args = CommandLine.arguments
guard args.count >= 3, let secs = Double(args[1]) else {
    FileHandle.standardError.write("usage: rec <seconds> <out.wav> [device-substring]\n".data(using: .utf8)!)
    exit(1)
}
let url = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: url)

func findDevice(named want: String) -> AudioDeviceID? {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
    var devs = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &devs)
    for d in devs {
        var nameAddr = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain)
        var cf: CFString = "" as CFString
        var csize = UInt32(MemoryLayout<CFString>.size)
        let err = withUnsafeMutablePointer(to: &cf) { p in
            AudioObjectGetPropertyData(d, &nameAddr, 0, nil, &csize, p)
        }
        if err != noErr || !(cf as String).contains(want) { continue }
        // Input side only: an output-only device (speakers, headphones) can share the name.
        var inAddr = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioObjectPropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain)
        var isize: UInt32 = 0
        if AudioObjectGetPropertyDataSize(d, &inAddr, 0, nil, &isize) != noErr || isize == 0 { continue }
        let abl = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: Int(isize))
        defer { abl.deallocate() }
        if AudioObjectGetPropertyData(d, &inAddr, 0, nil, &isize, abl) != noErr { continue }
        var ch = 0
        for b in UnsafeMutableAudioBufferListPointer(abl) { ch += Int(b.mNumberChannels) }
        if ch > 0 { return d }
    }
    return nil
}

func deviceProp<T>(_ d: AudioDeviceID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope, _ def: T) -> T {
    var a = AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
    var v = def
    var sz = UInt32(MemoryLayout<T>.size)
    AudioObjectGetPropertyData(d, &a, 0, nil, &sz, &v)
    return v
}

// Device: third argument, else $REC_DEVICE, else the EVO4 (a substring of
// the CoreAudio name: "MicroBook" finds "MOTU MicroBook II").
let want = args.count >= 4 ? args[3] : (ProcessInfo.processInfo.environment["REC_DEVICE"] ?? "EVO4")
guard let dev = findDevice(named: want) else {
    FileHandle.standardError.write("\(want) not found\n".data(using: .utf8)!)
    exit(2)
}

let rate = deviceProp(dev, kAudioDevicePropertyNominalSampleRate, kAudioObjectPropertyScopeGlobal, Double(0))
// The IOProc hands us the device's canonical input layout: Float32, one buffer per
// stream, each buffer mNumberChannels wide (the MicroBook: six mono streams).
let channels: Int = {
    var a = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamConfiguration,
                                       mScope: kAudioObjectPropertyScopeInput,
                                       mElement: kAudioObjectPropertyElementMain)
    var sz: UInt32 = 0
    AudioObjectGetPropertyDataSize(dev, &a, 0, nil, &sz)
    let abl = UnsafeMutablePointer<AudioBufferList>.allocate(capacity: Int(sz))
    defer { abl.deallocate() }
    AudioObjectGetPropertyData(dev, &a, 0, nil, &sz, abl)
    var n = 0
    for b in UnsafeMutableAudioBufferListPointer(abl) { n += Int(b.mNumberChannels) }
    return n
}()
guard rate > 0, channels > 0 else {
    FileHandle.standardError.write("\(want): no input (rate \(rate), \(channels) ch)\n".data(using: .utf8)!)
    exit(3)
}

// Whole capture preallocated, interleaved int32: the IO thread only copies.
// (+1 s slack: the last cycle may run past the deadline.)
let capacity = Int((secs + 1.0) * rate) * channels
let pcm = UnsafeMutablePointer<Int32>.allocate(capacity: capacity)
pcm.initialize(repeating: 0, count: capacity)
var written = 0          // frames, advanced only by the IO thread
var firstCycle: Double = 0
var stopping = false

var procID: AudioDeviceIOProcID?
let cerr = AudioDeviceCreateIOProcIDWithBlock(&procID, dev, nil) { _, inData, _, _, _ in
    if stopping { return }
    if firstCycle == 0 { firstCycle = Date().timeIntervalSince1970 }
    let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
    var frames = 0
    for b in abl where b.mNumberChannels > 0 {
        frames = Int(b.mDataByteSize) / (4 * Int(b.mNumberChannels))
        break
    }
    if frames == 0 || written + frames > capacity / channels { return }
    var ch = 0
    for b in abl {
        let c = Int(b.mNumberChannels)
        guard c > 0, let data = b.mData else { continue }
        let src = data.assumingMemoryBound(to: Float.self)
        for i in 0..<frames {
            for k in 0..<c {
                let v = max(-1.0, min(1.0, src[i * c + k]))
                pcm[(written + i) * channels + ch + k] = Int32(v * 2147483647.0)
            }
        }
        ch += c
    }
    written += frames
}
guard cerr == noErr, let pid = procID else {
    FileHandle.standardError.write("ioproc create failed \(cerr)\n".data(using: .utf8)!)
    exit(4)
}
let serr = AudioDeviceStart(dev, pid)
guard serr == noErr else {
    FileHandle.standardError.write("device start failed \(serr)\n".data(using: .utf8)!)
    exit(5)
}
// Report live at the FIRST IO cycle, not at start(): callers align on this stamp.
let deadline = Date().addingTimeInterval(5)
while firstCycle == 0 && Date() < deadline { Thread.sleep(forTimeInterval: 0.002) }
guard firstCycle != 0 else {
    AudioDeviceStop(dev, pid)
    FileHandle.standardError.write("\(want): no IO cycles in 5 s\n".data(using: .utf8)!)
    exit(6)
}
print("START \(firstCycle) rate \(rate) ch \(channels)")
fflush(stdout)
Thread.sleep(forTimeInterval: secs)
stopping = true
AudioDeviceStop(dev, pid)
AudioDeviceDestroyIOProcID(dev, pid)
let frames = written

// WAV: 44-byte canonical header, 32-bit PCM interleaved.
var out = Data(capacity: 44 + frames * channels * 4)
func le32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { out.append(contentsOf: $0) } }
func le16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { out.append(contentsOf: $0) } }
let dataBytes = UInt32(frames * channels * 4)
out.append(contentsOf: Array("RIFF".utf8)); le32(36 + dataBytes)
out.append(contentsOf: Array("WAVE".utf8))
out.append(contentsOf: Array("fmt ".utf8)); le32(16)
le16(1); le16(UInt16(channels)); le32(UInt32(rate))
le32(UInt32(rate) * UInt32(channels) * 4); le16(UInt16(channels * 4)); le16(32)
out.append(contentsOf: Array("data".utf8)); le32(dataBytes)
out.append(UnsafeBufferPointer(start: pcm, count: frames * channels))
try! out.write(to: url)
print("DONE frames \(frames) = \(Double(frames)/rate)s (asked \(secs)s)")

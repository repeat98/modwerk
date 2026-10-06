import { FORUM_MEDIA } from './forum-contract'
// Compression happens in the browser so uploads stay small and re-encoding drops photo metadata (such as GPS).
// Decoding holds the whole clip as 32-bit samples (five stereo minutes is about 115 MB), so inputs are capped first.
export const IMAGE_MAX_SIDE = 2048, AUDIO_BITRATE = 96000, MAX_AUDIO_SECONDS = 300, MAX_INPUT_BYTES = 150 * 1024 * 1024
/** A file chosen in a composer: compressed, then uploaded; the post sends only ready IDs and descriptions. */
export type PendingMedia = {key:string;kind:'image'|'audio';name:string;preview:string;caption:string;status:'preparing'|'uploading'|'ready'|'error';id?:string;bytes?:number;error?:string}
export const readyAttachments = (items: PendingMedia[]) => items.flatMap(item => item.status === 'ready' && item.id ? [{ id: item.id, caption: item.caption }] : [])
export const mediaBusy = (items: PendingMedia[]) => items.some(item => item.status === 'preparing' || item.status === 'uploading')
const OPUS_RATE = 48000

export async function compressImage(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('This image is too large to prepare.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('This image could not be read. Use PNG, JPEG or WebP.') }
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare images.')
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const encode = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  let blob = await encode('image/webp', 0.82)
  // Safari cannot encode WebP and falls back to PNG; JPEG has no transparency, so fill it white.
  if (blob?.type !== 'image/webp') {
    context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
    blob = await encode('image/jpeg', 0.85)
  }
  if (!blob) throw new Error('This image could not be prepared.')
  if (blob.size > FORUM_MEDIA.maxImageBytes) throw new Error('This image is too large, even after compression.')
  return blob
}

/** Decodes any format the browser can read, resampled to 48 kHz, and encodes Opus in an Ogg file. */
export async function compressAudio(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('This sound file is too large to prepare. Export a shorter clip.')
  let decoded: AudioBuffer
  try { decoded = await new OfflineAudioContext(1, 1, OPUS_RATE).decodeAudioData(await file.arrayBuffer()) }
  catch { throw new Error('This sound file could not be read. Try WAV, AIFF, FLAC, MP3 or Ogg.') }
  if (decoded.duration > MAX_AUDIO_SECONDS) throw new Error(`Sound clips can be up to ${MAX_AUDIO_SECONDS / 60} minutes long.`)
  const channels = Math.min(decoded.numberOfChannels, 2), config = { codec: 'opus', sampleRate: OPUS_RATE, numberOfChannels: channels, bitrate: AUDIO_BITRATE }
  if (typeof AudioEncoder === 'undefined' || !(await AudioEncoder.isConfigSupported(config)).supported) return uncompressedAudio(file)
  const packets: Uint8Array[] = []
  let preSkip = 312, failure: unknown
  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      const bytes = new Uint8Array(chunk.byteLength); chunk.copyTo(bytes); packets.push(bytes)
      const description = metadata?.decoderConfig?.description
      if (description) { const head = new Uint8Array(ArrayBuffer.isView(description) ? description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength) : description); if (head.length >= 12 && String.fromCharCode(...head.slice(0, 8)) === 'OpusHead') preSkip = head[10] | head[11] << 8 }
    },
    error: error => { failure = error },
  })
  encoder.configure(config)
  // Encoders hold back their lookahead (the pre-skip) when flushed, so silence is appended to carry the real ending
  // out; the last page's granule position then trims playback to the original length.
  const padded = decoded.length + 2 * 960
  for (let start = 0; start < padded; start += OPUS_RATE) {
    const length = Math.min(OPUS_RATE, padded - start), planar = new Float32Array(length * channels)
    for (let channel = 0; channel < channels; channel++) planar.set(decoded.getChannelData(channel).subarray(start, start + length), channel * length)
    const data = new AudioData({ format: 'f32-planar', sampleRate: OPUS_RATE, numberOfFrames: length, numberOfChannels: channels, timestamp: Math.round(start / OPUS_RATE * 1e6), data: planar })
    encoder.encode(data); data.close()
  }
  await encoder.flush(); encoder.close()
  if (failure || !packets.length) throw new Error('This sound clip could not be compressed.')
  // Chrome's decoder ends playback one pre-skip before the granule position RFC 7845 defines, cutting the last
  // 6.5 ms. Declaring one more pre-skip of the silent padding keeps the whole clip there; other decoders play that
  // much extra silence.
  const blob = new Blob([oggOpus(packets, channels, preSkip, decoded.length + preSkip)], { type: 'audio/ogg' })
  if (blob.size > FORUM_MEDIA.maxAudioBytes) throw new Error('This sound clip is too large, even after compression.')
  return blob
}
// Browsers without an Opus encoder upload the original file when the server accepts it as it is.
async function uncompressedAudio(file: Blob) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer()), text = String.fromCharCode(...head)
  const accepted = text.startsWith('OggS') || text.startsWith('ID3') || (head[0] === 255 && (head[1] & 224) === 224) || (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE')
  if (!accepted) throw new Error('This browser cannot compress sound. Export the clip as MP3 or Ogg and try again.')
  if (file.size > FORUM_MEDIA.maxAudioBytes) throw new Error('This browser cannot compress sound, and the file is over 10 MB. Export a shorter clip or an MP3.')
  return file
}

/** Samples (at 48 kHz) in one Opus packet, read from its TOC byte (RFC 6716 §3.1). */
export function opusPacketSamples(packet: Uint8Array) {
  const config = packet[0] >> 3, code = packet[0] & 3
  const tenths = config < 12 ? [100, 200, 400, 600][config & 3] : config < 16 ? [100, 200][config & 1] : [25, 50, 100, 200][config & 3]
  const frames = code === 0 ? 1 : code < 3 ? 2 : packet[1] & 63
  return frames * tenths * OPUS_RATE / 10000
}
const CRC = Array.from({ length: 256 }, (_, index) => { let value = index << 24; for (let bit = 0; bit < 8; bit++) value = value & 0x80000000 ? (value << 1) ^ 0x04c11db7 : value << 1; return value >>> 0 })
export function oggCrc(bytes: Uint8Array) { let crc = 0; for (const byte of bytes) crc = ((crc << 8) ^ CRC[((crc >>> 24) ^ byte) & 255]) >>> 0; return crc }
/** An Ogg Opus file (RFC 7845): identification and comment headers, then audio pages of about a second. */
export function oggOpus(packets: Uint8Array[], channels: number, preSkip: number, samples: number) {
  const serial = crypto.getRandomValues(new Uint32Array(1))[0], pages: Uint8Array[] = []
  function page(contents: Uint8Array[], granule: number, flags: number) {
    const lacing: number[] = []
    for (const packet of contents) { for (let rest = packet.length; ; rest -= 255) { lacing.push(Math.min(rest, 255)); if (rest < 255) break } }
    const size = contents.reduce((sum, packet) => sum + packet.length, 0), bytes = new Uint8Array(27 + lacing.length + size), view = new DataView(bytes.buffer)
    bytes.set([79, 103, 103, 83, 0, flags]); view.setBigUint64(6, BigInt(granule), true); view.setUint32(14, serial, true); view.setUint32(18, pages.length, true)
    bytes[26] = lacing.length; bytes.set(lacing, 27)
    let offset = 27 + lacing.length
    for (const packet of contents) { bytes.set(packet, offset); offset += packet.length }
    view.setUint32(22, oggCrc(bytes), true)
    pages.push(bytes)
  }
  const head = new Uint8Array(19), headView = new DataView(head.buffer)
  head.set(new TextEncoder().encode('OpusHead')); head[8] = 1; head[9] = channels; headView.setUint16(10, preSkip, true); headView.setUint32(12, OPUS_RATE, true)
  page([head], 0, 2)
  const vendor = new TextEncoder().encode('Modwerk'), tags = new Uint8Array(16 + vendor.length)
  tags.set(new TextEncoder().encode('OpusTags')); new DataView(tags.buffer).setUint32(8, vendor.length, true); tags.set(vendor, 12)
  page([tags], 0, 0)
  // The last page's granule position marks where the original audio ends, so decoders trim the encoder's padding.
  const total = packets.reduce((sum, packet) => sum + opusPacketSamples(packet), 0), end = Math.min(preSkip + samples, total)
  let batch: Uint8Array[] = [], segments = 0, granule = preSkip
  packets.forEach((packet, index) => {
    const needed = Math.floor(packet.length / 255) + 1
    if (batch.length && (segments + needed > 255 || batch.length >= 50)) { page(batch, Math.min(granule, end), 0); batch = []; segments = 0 }
    batch.push(packet); segments += needed; granule += opusPacketSamples(packet)
    if (index === packets.length - 1) page(batch, end, 4)
  })
  const file = new Uint8Array(pages.reduce((sum, item) => sum + item.length, 0))
  let offset = 0
  for (const item of pages) { file.set(item, offset); offset += item.length }
  return file
}

/** Profile pictures: the centre square, at most 512 px, as WebP (JPEG where the browser cannot encode WebP). */
export async function compressAvatar(file: Blob): Promise<Blob> {
  if (file.size > MAX_INPUT_BYTES) throw new Error('This image is too large to prepare.')
  let bitmap: ImageBitmap
  try { bitmap = await createImageBitmap(file) } catch { throw new Error('This image could not be read. Use PNG, JPEG or WebP.') }
  const side = Math.min(bitmap.width, bitmap.height), size = Math.max(1, Math.min(512, side))
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot prepare images.')
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size); bitmap.close()
  const encode = (type: string, quality: number) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality))
  let blob = await encode('image/webp', 0.85)
  if (blob?.type !== 'image/webp') {
    context.globalCompositeOperation = 'destination-over'; context.fillStyle = '#fff'; context.fillRect(0, 0, size, size)
    blob = await encode('image/jpeg', 0.86)
  }
  if (!blob) throw new Error('This image could not be prepared.')
  return blob
}

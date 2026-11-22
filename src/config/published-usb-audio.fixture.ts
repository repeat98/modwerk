import packages from '../engine/assets/octatrack-module-packages.json' with { type: 'json' }

// Independent expectation for tests of the installer, React components and Worker.
export const publishedUsbAudioPackage = 'usbAudio' in packages && !!(packages.usbAudio as { configurable?: unknown }).configurable

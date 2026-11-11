import type { LoadReading } from '../engine/elekloader/upload-wire'

/** Tenths of a percent as the load cells show them. */
export const percent = (value: number | null | undefined) => value == null ? '—' : `${(value / 10).toFixed(1)}%`
export interface LoadPoint { at: number; reading: LoadReading | null }
/** A line through the readings of `key` (tenths of a percent) in the last five minutes, broken where one is missing. */
export function loadPath<K extends string>(points: { at: number; reading: Partial<Record<K, number | null>> | null }[], key: K, now: number) {
  let path = '', connected = false, previous = 0
  for (const point of points) {
    const value = point.reading?.[key]
    if (value == null || now - point.at > 300000) { connected = false; continue }
    const x = Math.max(0, 600 - (now - point.at) / 500), y = 120 - value * .12
    path += `${connected && point.at - previous <= 6000 ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)} `
    connected = true; previous = point.at
  }
  return path
}

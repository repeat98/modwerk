import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type binding from '../../../sdk/machines/octatrack/base-binding.json'
import type fills from '../assets/octatrack-base-fills.json'
import type variants from '../assets/octatrack-base-variants.json'
import packages from '../assets/octatrack-module-packages.json' with { type: 'json' }
import { publishedUsbAudioPackage } from '../../config/published-usb-audio.fixture'

const assets = resolve('src/engine/assets')
const linked = resolve(assets, 'linked-audio-0.7.11')
const staged = !publishedUsbAudioPackage && existsSync(resolve(linked, 'base-binding.json'))
const source = staged ? linked : assets
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

// Expected downloads come from the committed records independently of the installer's selection code.
export const publishedBinding: typeof binding = json(staged ? resolve(linked, 'base-binding.json') : resolve('sdk/machines/octatrack/base-binding.json'))
export const publishedFills: typeof fills = json(resolve(source, 'octatrack-base-fills.json'))
export const publishedVariants: typeof variants = json(resolve(source, 'octatrack-base-variants.json'))
export const publishedPackageText = () => readFileSync(resolve(source, 'octatrack-base.elemod'), 'utf8')
type CurrentRow = typeof packages.packages[number]
const linkedRows: CurrentRow[] = staged ? json(resolve(linked, 'linked-base-packages.json')) : []
const byId = new Map(linkedRows.map(entry => [entry.id, entry]))
export const publishedManifest = { ...packages, packages: packages.packages.map(entry => byId.get(entry.id) ?? entry) }

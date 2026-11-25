// Machine images from manufacturers, elektronmods.com and Wikimedia Commons. See docs/MACHINE_IMAGES.md for terms.
// Credits show with each image and on the machine overview.
export type MachinePhoto = { src: string; author: string; license: string; licenseUrl?: string; source: string; via: string; cutout?: boolean }

const ELEKTRON = { author: 'Elektron', license: 'Press image', source: 'https://www.elektron.se/press', via: 'Elektron press kit', cutout: true }
const ELEKTRONMODS = { author: 'elektronmods.com', license: 'Used with permission', source: 'https://elektronmods.com', via: 'elektronmods.com', cutout: true }
const ZOOM = { author: 'Zoom', license: 'Product image', via: 'Zoom', cutout: true }

export const MACHINE_PHOTOS: Record<string, MachinePhoto> = {
  'octatrack': { src: 'machines/octatrack.webp', ...ELEKTRON },
  'digitakt': { src: 'machines/digitakt.webp', ...ELEKTRONMODS },
  'digitone': { src: 'machines/digitone.webp', ...ELEKTRONMODS },
  'digitakt-ii': { src: 'machines/digitakt-ii.webp', ...ELEKTRON },
  'digitone-ii': { src: 'machines/digitone-ii.webp', ...ELEKTRON },
  'syntakt': { src: 'machines/syntakt.webp', ...ELEKTRON },
  'model-samples': { src: 'machines/model-samples.webp', ...ELEKTRON },
  'model-cycles': { src: 'machines/model-cycles.webp', ...ELEKTRON },
  'tonverk': { src: 'machines/tonverk.webp', ...ELEKTRON },
  'analog-rytm-mkii': { src: 'machines/analog-rytm-mkii.webp', ...ELEKTRON },
  'analog-rytm-mki': { src: 'machines/analog-rytm-mki.jpg', author: "Brandon Daniel", license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0', via: 'Wikimedia Commons', source: "https://commons.wikimedia.org/wiki/File:Elektron_Analog_RYTM_-_2014_NAMM_Show.jpg" },
  'analog-four-mki': { src: 'machines/analog-four-mki.webp', author: 'Elektron', license: 'Product image', source: 'https://www.elektron.se/legacy', via: 'Elektron', cutout: true },
  'analog-four-mkii': { src: 'machines/analog-four-mkii.webp', ...ELEKTRON },
  'analog-keys': { src: 'machines/analog-keys.jpg', author: "Brandon Daniel", license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0', via: 'Wikimedia Commons', source: "https://commons.wikimedia.org/wiki/File:Elektron_Analog_Keys_-_2014_NAMM_Show.jpg" },
  'analog-heat': { src: 'machines/analog-heat.webp', ...ELEKTRON },
  'machinedrum': { src: 'machines/machinedrum.jpg', author: "j bizzie (derivative work: Clusternote)", license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0', via: 'Wikimedia Commons', source: "https://commons.wikimedia.org/wiki/File:Elektron_MACHINEDRUM_SPS-1UW.jpg" },
  'lxr-02': { src: 'machines/lxr-02.webp', author: 'Erica Synths', license: 'Product image', source: 'https://www.ericasynths.lv/drum-synthesizer-lxr-02-1132/', via: 'Erica Synths', cutout: true },
  'monomachine': { src: 'machines/monomachine.jpg', author: "GeschnittenBrot (derivative work: Clusternote)", license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0', via: 'Wikimedia Commons', source: "https://commons.wikimedia.org/wiki/File:Elektron_MONOMACHINE.jpg" },
  'zoom-ms-70cdr': { src: 'machines/zoom-ms-70cdr.webp', ...ZOOM, source: 'https://zoomcorp.com/en/jp/multi-effects/multistomp-pedals/ms-70cdr/' },
  'zoom-ms-50g': { src: 'machines/zoom-ms-50g.webp', ...ZOOM, source: 'https://zoomcorp.com/en/jp/multi-effects/multistomp-pedals/ms-50g/' },
  'zoom-ms-60b': { src: 'machines/zoom-ms-60b.webp', ...ZOOM, source: 'https://zoomcorp.com/en/jp/multi-effects/multistomp-pedals/ms-60b/' },
  'zoom-g1on': { src: 'machines/zoom-g1on.webp', ...ZOOM, source: 'https://zoomcorp.com/en/us/multi-effects/guitar-effects/g1on/' },
  'zoom-g1-four': { src: 'machines/zoom-g1-four.webp', ...ZOOM, source: 'https://zoomcorp.com/en/us/multi-effects/guitar-effects/g1-four-g1x-four/' },
}

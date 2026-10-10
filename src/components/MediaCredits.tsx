import { ownerCredit } from '../catalog/module-authors'

type CreditedMedia = {
  captureType: 'hardware' | 'emulator' | 'audio' | 'image'
  credit: string
  license: string
  source: string
}

export function MediaCredits({ media }: { media: readonly CreditedMedia[] }) {
  const credits = [...new Map(media.map(item => [
    JSON.stringify([item.captureType, item.credit, item.license, item.source]), item,
  ])).entries()]
  if (!credits.length) return null
  return <details className="module-full-instructions media-credits">
    <summary>{media.some(item => item.captureType === 'audio') ? 'Media credits' : 'Screenshot credits'}</summary>
    {credits.map(([key, item]) => <p key={key}>
      {item.captureType === 'hardware' ? 'Hardware capture' : item.captureType === 'emulator' ? 'Emulator capture' : item.captureType === 'audio' ? 'Audio preview' : 'Image'} · {ownerCredit(item.credit)} · {item.license}
      {item.source !== 'original' && <> <a href={item.source} target="_blank" rel="noreferrer">Original source ↗</a></>}
    </p>)}
  </details>
}

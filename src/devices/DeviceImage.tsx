import { DeviceArt } from './DeviceArt'
import { MACHINE_PHOTOS } from './photos'
import { DEVICES, type DeviceProfile } from './registry'

// A machine's freely licensed photo, or the line drawing when no photo is available yet.
export function DeviceImage({ device, eager = false }: { device: DeviceProfile; eager?: boolean }) {
  const photo = MACHINE_PHOTOS[device.id]
  if (!photo) return <DeviceArt art={device.art} />
  return <img className={'device-photo' + (photo.cutout ? ' is-cutout' : '')} src={import.meta.env.BASE_URL + photo.src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" title={'Photo: ' + photo.author + ' · ' + photo.license} />
}

export function PhotoCredit({ device }: { device: DeviceProfile }) {
  const photo = MACHINE_PHOTOS[device.id]
  if (!photo) return null
  return <p className="photo-credit">Image: <a href={photo.source} target="_blank" rel="noreferrer">{photo.author}</a>, {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> : photo.license.toLowerCase()}{photo.via !== photo.author && <>, via {photo.via}</>}</p>
}

// Every machine image's credit, wherever the machines are shown together (the overview and the forum's front page).
export function MachinePhotoCredits() {
  return <details className="photo-credits"><summary>Image credits</summary><p>Machine images come from Elektron’s press kit, from elektronmods.com, used with permission, and from Wikimedia Commons under their authors’ free licences. Machines without a photo are shown as original line drawings. Elektron and Zoom product names identify the machines only; Modwerk is not affiliated with Elektron or Zoom.</p><ul>{DEVICES.filter(device => MACHINE_PHOTOS[device.id]).map(device => { const photo = MACHINE_PHOTOS[device.id]; return <li key={device.id}>{device.name}{device.variants ? ' ' + device.variants.join(' / ') : ''}: <a href={photo.source} target="_blank" rel="noreferrer">{photo.author}</a>, {photo.licenseUrl ? <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a> : photo.license.toLowerCase()}</li> })}</ul></details>
}

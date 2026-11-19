import { useContext } from 'react'
import { Icon } from '../components/Icon'
import { downloadNote, type ModuleStatistics } from './module-statistics'
import { DownloadPeriodContext } from './download-period'
import { ModuleWorksCount } from './ModuleWorksCount'
// Working reports and likes lead; `secondary` leaves them out for a page that shows them as tiles of their own.
export function ModulePopularity({statistics,id,secondary=false}:{statistics?:{likes:number;downloads?:number;downloadsStarted?:string|null;sharedConfigurations?:number;worksReports?:number}&Partial<Pick<ModuleStatistics,'downloads7'|'downloads30'|'downloads90'|'dailyStarted'>>;id?:string;secondary?:boolean}) {
  const shared=statistics?.sharedConfigurations, days=useContext(DownloadPeriodContext), downloads=days ? statistics?.[`downloads${days}`] : statistics?.downloads
  return <div className="module-popularity">{!secondary&&<><ModuleWorksCount count={statistics?.worksReports}/><span><Icon name="heart" size={13}/>{statistics ? statistics.likes.toLocaleString() : '—'} {statistics?.likes === 1 ? 'like' : 'likes'}</span></>}<span title={downloadNote(days,statistics as ModuleStatistics|undefined)}><Icon name="download" size={13}/>{downloads === undefined ? '—' : downloads.toLocaleString()} {downloads === 1 ? 'download' : 'downloads'}{days ? ' in ' + days + ' days' : ''}</span>{!!shared&&id&&<a href={'#forum?category=configs&module='+encodeURIComponent(id)} title="Shared configurations that include this module"><Icon name="sliders" size={13}/>Used in {shared.toLocaleString()} shared {shared===1?'configuration':'configurations'}</a>}</div>
}

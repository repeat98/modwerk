import { MODULE_DOCUMENTS_BY_ID } from '../catalog/documents'
import { Icon } from './Icon'
export function ModuleControls({id}:{id:string}){
 const controls=MODULE_DOCUMENTS_BY_ID[id]?.controls??[]
 return <details className="module-disclosure controls-section">
   <summary><span>Controls & defaults{controls.length > 0 && <small>{controls.length} controls</small>}</span><Icon name="plus" size={16} /></summary>
   <div className="disclosure-content">
     {controls.length ? <><p className="service-note">Starting values · adjust on your Octatrack.</p><dl className="control-docs">{controls.map(control=><div key={control.name}><dt>{control.name}<span>{control.labels?.[control.default]??control.default}</span></dt><dd>{control.doc}{control.labels&&control.labels.length<=8&&<small>{control.labels.join(' · ')}</small>}</dd></div>)}</dl></> : <p>{id==='repitch'?'REPITCH appears as a TIMESTRETCH mode on Flex, Static and the sample attributes page. Enable REPITCH to follow project tempo through playback speed; pitch changes along with speed.':'Choose channels and recording settings in your host audio application. This module has no effect-page knobs.'}</p>}
   </div>
 </details>
}

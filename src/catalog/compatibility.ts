import compact from './compatibility-checks.json'
import { recordedCheck, type CompactChecks } from './compatibility-checks'
import { CATALOG_SOURCE, resolveSelection } from './modules'
import { moduleBuildError } from './build-support'
import { selectionConflicts } from './selection-conflicts'
export function checkSelection(ids: readonly string[], keepStockFx2 = false) {
 const modules=resolveSelection(ids), conflicts=selectionConflicts(ids, keepStockFx2)
 const result=(notes:string[],checked=false)=>({issues:[...conflicts.map(conflict=>conflict.description),...notes],notes,conflicts,checked:checked&&!conflicts.length})
 if(!modules.length)return result([])
 const pending=moduleBuildError(ids)
 if(pending)return result([pending])
 if(CHECKS.revision!==CATALOG_SOURCE.revision)return result(['Compatibility metadata does not match this catalog revision.'])
 if(modules.length===1&&modules[0].id==='midi-scenes')return result([],true)
 if(conflicts.length)return result([])
 const recorded=recordedCheck(CHECKS,modules.map(m=>m.id),CHECKED)
 return result(recorded??['This selection has no recorded declaration check.'],recorded!==undefined)
}
const CHECKS=compact as CompactChecks,CHECKED=new Set(CHECKS.checked)

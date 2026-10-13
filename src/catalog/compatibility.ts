import stored from './compatibility-checks.json'
import { openChecks, recordedCheck, type CompactChecks, type StoredChecks } from './compatibility-checks'
import { CATALOG_SOURCE, resolveSelection } from './modules'
import { moduleBuildError } from './build-support'
import { selectionConflicts } from './selection-conflicts'
export function checkSelection(ids: readonly string[], keepStockFx2 = false) {
 const modules=resolveSelection(ids), conflicts=selectionConflicts(ids, keepStockFx2)
 const result=(notes:string[],checked=false)=>({issues:[...conflicts.map(conflict=>conflict.description),...notes],notes,conflicts,checked:checked&&!conflicts.length})
 if(!modules.length)return result([])
 const pending=moduleBuildError(ids)
 if(pending)return result([pending])
 const {checks,checked}=loaded()
 if(checks.revision!==CATALOG_SOURCE.revision)return result(['Compatibility metadata does not match this catalog revision.'])
 if(modules.length===1&&modules[0].id==='midi-scenes')return result([],true)
 if(conflicts.length)return result([])
 const recorded=recordedCheck(checks,modules.map(m=>m.id),checked)
 return result(recorded??['This selection has no recorded declaration check.'],recorded!==undefined)
}
// Decoded on first use, then kept: neither the page nor the worker needs the table until a selection is checked.
let opened:{checks:CompactChecks;checked:Set<number>}|undefined
function loaded(){if(!opened){const checks=openChecks(stored as unknown as StoredChecks);opened={checks,checked:new Set(checks.checked)}}return opened}

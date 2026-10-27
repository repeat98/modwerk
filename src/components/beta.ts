// The beta interface's own views and the USB link (hasBetaUi). App imports this module on demand, so visitors
// without beta access never download it.
import { OctatrackLink } from '../engine/elekloader/octatrack-link'
import { moduleSetKit } from '../engine/elekloader/module-set'
export { OctatrackHub } from './OctatrackHub'
export { LoadDialog } from './LoadDialog'
export { InstrumentItem } from './InstrumentItem'
export { CardInstall } from './UnitPanel'
export { ModuleGrid, StateChip } from './ModuleGrid'
export { ModuleDialog } from './ModuleDialog'
export { OctatrackActivity, OctatrackStatus, OctatrackSidebarStatus } from './OctatrackStatus'
export { BaseInstallDialog } from './BaseInstallDialog'
export { BetaModuleSets } from './BetaModuleSets'
export { OctatrackDiagnosticsCollector, OctatrackDiagnosticsSettings } from './OctatrackDiagnostics'
export { PutBackModules } from './PutBackModules'

/** The site's one link to the unit: module set loads from the site's packages. */
export function createUsbKit() {
  const link = new OctatrackLink()
  return { link, ...moduleSetKit(link) }
}

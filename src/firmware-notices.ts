export const INDEPENDENCE_NOTICE = 'Modwerk is an independent, unofficial project. It is not affiliated with, endorsed by or supported by Elektron, Zoom or Erica Synths.'
export const FLASHING_RISKS = 'Custom firmware can make your device unusable, cause data loss, affect warranty coverage and prevent future official updates. Recovery is not guaranteed.'
export const FIRMWARE_SHARING_NOTICE = 'Do not upload, share or redistribute original or generated firmware images: they contain Elektron’s copyrighted firmware. Share configuration JSON and properly licensed module sources instead.'
// The way back before anyone installs the Modwerk base: shown in the base install guide, the FAQ and the beta invitation.
export const BASE_RECOVERY_NOTICE = 'Before you install the Modwerk base, make sure you can recover without the Octatrack’s USB: have a CompactFlash card reader at hand, and ideally a MIDI interface to send Elektron’s original OS .syx through the startup menu.'
// What the first install needs: shown in the base install guide and the welcome to modules over USB.
export const BASE_INSTALL_NEEDS = 'You need an Octatrack (MKI or MKII), your original OS 1.40C file, a USB cable, Chrome or Edge on a computer, and a CompactFlash card reader in case USB stops working.'
// Where everyone reports problems with the base, a sync or a module: the site's own report forms (the Your Octatrack
// page's Report a problem, a module page's report form). Beta modules and beta pages keep BETA_REPORTING_NOTICE.
export const REPORT_PROBLEMS = 'Report problems with Report a problem on the Your Octatrack page, or with the report form on the module’s page.'
// Where beta bugs go, shown wherever a tester joins or reports.
export const BETA_REPORTING_NOTICE = 'Report bugs in beta modules and beta pages only in #beta-testers on Discord, not through the report forms on this site.'
/** How to start the Octatrack without loading its modules. The only place this is said: the base install guide and the
 * Your Octatrack page show it when it is not empty. Not yet confirmed on hardware with the base that brings it; set it to
 * '' to take it off the site. */
export const MODULE_SKIP_HINT: string = 'If the Octatrack doesn’t start with your modules, hold PROJ while you switch it on: it starts without loading them, and loads them again at the next start.'

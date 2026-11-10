export const SITE_NAME = 'Modwerk'
/** A page's title as tabs, bookmarks and link previews show it: the page first, then the site. */
export function pageTitle(name: string, site: string = SITE_NAME): string { return name + ' · ' + site }
export const HOME_TITLE = SITE_NAME + ' · Community mods for Elektron Octatrack, Digitakt, Digitone & Rytm'
export const HOME_DESCRIPTION = 'Community mods for electronic music hardware. Build Octatrack, Digitakt, Digitone and Rytm firmware in your browser, or help open up the next instrument. Firmware stays on your device.'

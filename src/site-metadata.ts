export const SITE_NAME = 'Modwerk'
/** A page's title as tabs, bookmarks and link previews show it: the page first, then the site. */
export function pageTitle(name: string, site: string = SITE_NAME): string { return name + ' · ' + site }
export const HOME_TITLE = SITE_NAME + ' · Mods for Elektron Octatrack, Digitakt & Digitone'
export const HOME_DESCRIPTION = 'Explore custom firmware modules for Elektron Octatrack, Digitakt and Digitone. Check compatibility and build firmware in your browser. Firmware stays on your device.'

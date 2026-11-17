// Local IDs this browser has given out, by file name: a stored patch may still point at one after its effect is removed,
// so another effect never gets it. Lost with the browser's storage; then only the pedal's own IDs count. Shared by the
// pedal page's file install and the library's.
const LOCAL_ID_KEY = 'modwerk-zoom-local-ids'
export const givenIds = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(LOCAL_ID_KEY) || '{}') } catch { return {} } }
export const rememberId = (fxid: number, name: string) => { try { localStorage.setItem(LOCAL_ID_KEY, JSON.stringify({ ...givenIds(), [fxid]: name })) } catch { /* storage off: nothing to keep */ } }
/** The local IDs not to hand to `name`: those given to other effects. */
export const avoidFor = (name: string) => { const given = givenIds(); return new Set(Object.keys(given).filter(id => given[id] !== name).map(Number)) }

import { createContext, useContext } from 'react'

/** Whether this page shows the Octatrack base path's interface (hasOctatrackBase), module sets and their words
 * included; App provides it, and anything rendered outside sees main's. */
export const BetaUi = createContext(false)
export const useBetaUi = () => useContext(BetaUi)
const WORDS = {
  classic: { set: 'configuration', sets: 'configurations', Set: 'Configuration', Sets: 'Configurations' },
  beta: { set: 'module set', sets: 'module sets', Set: 'Module set', Sets: 'Module sets' },
}
/** The beta calls configurations module sets; everyone else keeps main's word. */
export const setWords = (beta: boolean) => WORDS[beta ? 'beta' : 'classic']
export const useSetWords = () => setWords(useBetaUi())

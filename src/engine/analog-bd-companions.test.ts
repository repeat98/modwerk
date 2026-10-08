import { describe, expect, it } from 'vitest'
import { DSP_EFFECT_IDS, resolveSelection } from '../catalog/modules'
import { ANALOG_BD_DSP_COMPANIONS, assertAnalogBdDspCompanions } from './analog-bd-layout'
import { composeStaticDsp } from './static-dsp'

const unsupported = DSP_EFFECT_IDS.filter(id => !ANALOG_BD_DSP_COMPANIONS.includes(id))
const profile = { fx1: [], fx2: [] }
describe('Analog BD DSP companion contract', () => {
  it.each(unsupported)('reports incompatible %s before core, package or space validation', async id => {
    const key = resolveSelection([id])[0].key
    await expect(composeStaticDsp([], ['analog-bassdrum', id], profile)).rejects.toThrow('ANALOG BD cannot share DSP memory with ' + key)
  })
  it('names every incompatible DSP effect and does not treat ColdFire utilities as DSP companions', () => {
    const ids = ['analog-bassdrum', 'repitch', 'spectrum', 'character']
    expect(() => assertAnalogBdDspCompanions(ids)).toThrow('ANALOG BD cannot share DSP memory with SPECTRUM, CHARACTER')
  })
  it.each(ANALOG_BD_DSP_COMPANIONS)('preserves the existing %s allowance and proceeds to normal core validation', async id => {
    const ids = ['analog-bassdrum', id, 'repitch']
    expect(() => assertAnalogBdDspCompanions(ids)).not.toThrow()
    await expect(composeStaticDsp([], ids, profile)).rejects.toThrow('DSP composition requires both stock cores')
  })
  it('leaves effects unrestricted by this contract when Analog BD is absent', async () => {
    expect(() => assertAnalogBdDspCompanions(unsupported)).not.toThrow()
    await expect(composeStaticDsp([], unsupported, profile)).rejects.toThrow('DSP composition requires both stock cores')
  })
})

// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { previewKit } from './octatrack-link-fake'
import { moduleSetReview } from '../engine/elekloader/module-set'
import { newConfiguration } from '../config/workspace'

// ?preview=usb-link: the pretend unit answers as the published base, so a set adding modules syncs instead of asking for a base update.
it('syncs a set that adds two modules in the USB link preview', async () => {
  const kit = previewKit(), stop = kit.link.start()
  await expect.poll(() => kit.link.getState().status).toBe('ready')
  const set = newConfiguration('Two more', ['everb', 'airwindows-chorus', 'poly8', 'tapeecho', 'grain'])
  const { identity } = kit.link.getState()
  expect(moduleSetReview(set, await kit.readInventory!(), identity?.capabilities, identity?.base).problem).toBeUndefined()
  const prepared = await kit.prepareUpdate!(set)
  await kit.link.update(prepared.name, prepared.changes)
  await kit.link.keep()
  expect(kit.link.getState().notice?.tone).toBe('success')
  stop()
}, 20000)

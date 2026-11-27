// SPDX-License-Identifier: GPL-3.0-or-later
// dev.c requests 5/8 acknowledge 1 only after remote_put accepted the event.
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export async function panelInput(send, request, value, { now = () => performance.now(), wait = sleep, timeoutMs = 1000 } = {}) {
  const started = now()
  for (;;) {
    const reply = await send(request, value, 1)
    if (reply?.[0] === 1) return
    if (reply?.[0] !== 0) throw new Error('Invalid panel event acknowledgement')
    if (now() - started >= timeoutMs) throw new Error('Panel event queue stayed full for ' + timeoutMs + ' ms')
    await wait(10)
  }
}

export async function panelKeys(send, codes, { wait = sleep, input = {} } = {}) {
  const held = [], errors = []
  let failure
  try {
    for (const [index, code] of codes.entries()) {
      held.push(code) // release even when the transfer's outcome is unknown
      await panelInput(send, 5, code | 0x100, input)
      await wait(index === codes.length - 1 ? 80 : 30)
    }
  } catch (error) { failure = error }
  for (const code of held.reverse()) {
    try { await panelInput(send, 5, code, input); await wait(30) }
    catch (error) { errors.push(error) }
  }
  if (failure && !errors.length) throw failure
  if (failure || errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], 'Panel key sequence did not finish cleanly')
}

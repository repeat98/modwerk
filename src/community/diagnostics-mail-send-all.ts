/** Send all (DiagnosticsMailPanel): the owner's signed-in browser sends the listed drafts one at a time through the same
 * route as a single Send, so each is checked and logged on its own (server/diagnostics-mail.ts). A 409 (the member can no
 * longer get it, or it was sent meanwhile) skips that one; any other refusal (the mail budget, the hourly limit, the
 * provider) stops the run and leaves the rest as drafts. */
export type SendAnswer = { status: number; error?: string }
export type SendAllResult = { sent: number; skipped: number; left: number; stopped?: string }

export async function sendAll(ids: readonly string[], sendOne: (id: string) => Promise<SendAnswer>, progress?: (done: number, total: number) => void): Promise<SendAllResult> {
  let sent = 0, skipped = 0
  for (const [index, id] of ids.entries()) {
    const answer = await sendOne(id).catch((): SendAnswer => ({ status: 0, error: 'The Modwerk service could not be reached.' }))
    if (answer.status >= 200 && answer.status < 300) ++sent
    else if (answer.status === 409) ++skipped
    else return { sent, skipped, left: ids.length - index, stopped: answer.error ?? 'The request could not be completed.' }
    progress?.(index + 1, ids.length)
  }
  return { sent, skipped, left: 0 }
}

export function sendAllNote({ sent, skipped, left, stopped }: SendAllResult) {
  const parts = [`Sent ${sent}.`, ...skipped ? [`Skipped ${skipped} that can no longer be sent.`] : []]
  return stopped ? [...parts, `Stopped with ${left} left as drafts: ${stopped}`].join(' ') : parts.join(' ')
}

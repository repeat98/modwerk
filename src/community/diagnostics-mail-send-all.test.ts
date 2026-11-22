import { describe, expect, it } from 'vitest'
import { sendAll, sendAllNote } from './diagnostics-mail-send-all'
import { renderDiagnosticsMail } from '../../server/diagnostics-mail'

describe('send all diagnostics emails', () => {
  it('sends each draft in turn, skips one that can no longer be sent and stops at the first other refusal', async () => {
    const answers: Record<string, { status: number; error?: string }> = { a: { status: 200 }, b: { status: 409 }, c: { status: 200 }, d: { status: 429, error: 'The daily mail budget is used up. Try again tomorrow.' }, e: { status: 200 } }
    const tried: string[] = [], seen: number[] = []
    const result = await sendAll(Object.keys(answers), async id => { tried.push(id); return answers[id] }, done => seen.push(done))
    expect(tried).toEqual(['a', 'b', 'c', 'd']) // e is never tried
    expect(result).toEqual({ sent: 2, skipped: 1, left: 2, stopped: 'The daily mail budget is used up. Try again tomorrow.' })
    expect(seen).toEqual([1, 2, 3])
    expect(sendAllNote(result)).toBe('Sent 2. Skipped 1 that can no longer be sent. Stopped with 2 left as drafts: The daily mail budget is used up. Try again tomorrow.')
  })
  it('reports a run that sent everything, and stops when the service cannot be reached', async () => {
    expect(sendAllNote(await sendAll(['a', 'b'], async () => ({ status: 200 })))).toBe('Sent 2.')
    expect(await sendAll(['a', 'b'], async () => { throw new TypeError('Failed to fetch') })).toEqual({ sent: 0, skipped: 0, left: 2, stopped: 'The Modwerk service could not be reached.' })
  })
})

describe('the diagnostics email greeting', () => {
  it('greets a chosen name, and a generated member name with a plain hello', () => {
    const mail = { subject: 'Your Octatrack', body: 'A sync was turned away once on 17 November.' }
    expect(renderDiagnosticsMail(mail, 'sharerone', 'https://modwerk.app/#x').text.startsWith('Hey sharerone,\n\n')).toBe(true)
    const plain = renderDiagnosticsMail(mail, 'member_5482ad9598b9', 'https://modwerk.app/#x')
    expect(plain.text.startsWith('Hey,\n\n')).toBe(true)
    expect(plain.html).not.toContain('member_5482ad9598b9')
  })
})

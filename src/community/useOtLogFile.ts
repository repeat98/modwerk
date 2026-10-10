import { useRef, useState } from 'react'
import { OT_LOG_MAX_BYTES, OtLogError, parseOtLog, type OtLog } from './ot-log'

/**
 * Reads the OCTAMOD.LOG files a reporter picks. They are checked in the browser with the Worker's own parser and
 * only sent when the report is posted. Of two files, the complete one with the newest file date is used.
 */
export function useOtLogFile() {
  const [log, setLog] = useState<OtLog | null>(null), [error, setError] = useState(''), [reading, setReading] = useState(false), [name, setName] = useState(''), [note, setNote] = useState('')
  const request = useRef(0), input = useRef<HTMLInputElement>(null)
  async function read(files: File[]) {
    const current = ++request.current
    setLog(null); setError(''); setNote(''); setReading(true)
    try {
      if (files.length > 2) throw new OtLogError('Choose OCTAMOD.LOG and, if present, OCTAMOD1.LOG. Two files are enough.')
      const valid: { file: File; log: OtLog }[] = [], rejected: string[] = []
      for (const file of files) {
        try {
          if (file.size > OT_LOG_MAX_BYTES) throw new OtLogError('This file is larger than 64 KB. Choose a log from the top folder of the card.')
          valid.push({ file, log: parseOtLog(new Uint8Array(await file.arrayBuffer())) })
        } catch (failure) { rejected.push(file.name + ': ' + (failure instanceof Error ? failure.message : 'Could not read this file.')) }
      }
      if (current !== request.current) return
      // Card file dates can be wrong if the device clock is unset, so the choice is shown and either file can be picked alone.
      valid.sort((a, b) => b.file.lastModified - a.file.lastModified)
      if (valid.length) {
        setLog(valid[0].log); setName(valid[0].file.name)
        setNote(rejected.length ? 'The other file could not be checked; using this complete log.' : valid.length > 1 ? 'Using the complete log with the newest file date. Choose either file on its own to change this.' : '')
      } else if (rejected.length) setError(rejected.join(' '))
    } catch (failure) { if (current === request.current) setError(failure instanceof Error ? failure.message : 'Unable to read the log.') }
    finally { if (current === request.current) setReading(false) }
  }
  function remove() {
    ++request.current; setReading(false); setLog(null); setError(''); setNote('')
    if (input.current) input.current.value = ''
  }
  return { file: { log, error, reading, name, note }, input, read, remove }
}

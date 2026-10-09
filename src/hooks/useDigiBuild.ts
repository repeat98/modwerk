// SPDX-License-Identifier: GPL-3.0-or-later
import { useEffect, useRef, useState } from 'react'
import { requireBuildAccount } from '../community/member-access'
import { trackUsage } from '../community/usage'
import { buildStep, createMachineBuilder, prepareBuild, type Builder } from '../engine/elekloader/machine-build'
import type { BuilderCheck, BuilderDevice, BuilderMachine, BuilderResult } from '../engine/elekloader/protocol'
import type { BuildProgress } from '../engine/protocol'

export type DigiBuildState =
  | { phase: 'idle'; key: string }
  | { phase: 'loading' | 'checking'; key: string }
  | { phase: 'ready'; key: string; enabled: string[]; check: BuilderCheck; device: BuilderDevice }
  | { phase: 'blocked'; key: string; error: string; check?: BuilderCheck }
  | { phase: 'building'; key: string; enabled: string[]; device: BuilderDevice; log: string; step: BuildProgress }
  | { phase: 'built'; key: string; enabled: string[]; device: BuilderDevice; moduleIds: readonly string[]; result: Extract<BuilderResult, { ok: true }> }
  | { phase: 'failed'; key: string; enabled: string[]; device: BuilderDevice; error: string; result?: Extract<BuilderResult, { ok: false }> }

const message = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback

/** Local Digitakt/Digitone builds. The engine loads only when asked; changed inputs discard checks and results. */
export function useDigiBuild(machine: BuilderMachine, file: File | undefined, release: string | undefined, moduleIds: readonly string[]) {
  const [engaged, setEngaged] = useState(false), [attempt, setAttempt] = useState(0), [loaded, setLoaded] = useState(false)
  const inputs = JSON.stringify([machine, release ?? '', file ? [file.name, file.size, file.lastModified] : null, [...moduleIds].sort()])
  const key = inputs + '#' + attempt
  const [view, setView] = useState<DigiBuildState>({ phase: 'idle', key: '' })
  const client = useRef<Builder | null>(null), operation = useRef(0)
  useEffect(() => () => { client.current?.dispose(); client.current = null }, [])
  useEffect(() => {
    if (!engaged || !file || !release) return
    const request = ++operation.current, controller = operation
    void requireBuildAccount().then(() => {
      if(operation.current!==request)return
      client.current ??= createMachineBuilder()
      return prepareBuild(client.current, { machine, release, stock: file, moduleIds })
    }).then(prepared => {
      if (operation.current !== request || !prepared) return
      setLoaded(true)
      setView(prepared.ok ? { phase: 'ready', key, enabled: prepared.enabled, check: prepared.check, device: prepared.device } : { phase: 'blocked', key, error: prepared.error, check: prepared.check })
    }).catch(error => { if (operation.current === request) setView({ phase: 'blocked', key, error: message(error, 'The builder could not check this selection.') }) })
    return () => { ++controller.current }
  // `key` captures the machine, release, file identity, selection and retries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, engaged])
  const state: DigiBuildState = view.key === key ? view : { phase: engaged && file && release ? loaded ? 'checking' : 'loading' : 'idle', key }
  function check() { setEngaged(true); setAttempt(value => value + 1) }
  async function build(version: string) {
    if (state.phase !== 'ready' && state.phase !== 'built' && state.phase !== 'failed') return
    const { enabled, device } = state, request = ++operation.current, builder = client.current!
    let step: BuildProgress = 'composing'
    setView({ phase: 'building', key, enabled, device, log: 'Starting the build…', step })
    let started = false
    try {
      await requireBuildAccount()
      if(operation.current!==request)return
      started = true
      const named = await builder.version(version, enabled)
      if (operation.current !== request) return
      if (!named.ok) { setView({ phase: 'failed', key, enabled, device, error: named.error ?? 'Check the OS version.' }); return }
      const result = await builder.build(enabled, version, named.name, line => {
        step = buildStep(line, step)
        if (operation.current === request) setView({ phase: 'building', key, enabled, device, log: line, step })
      })
      if (operation.current !== request) return
      setView(result.ok ? { phase: 'built', key, enabled, device, moduleIds: [...moduleIds], result } : { phase: 'failed', key, enabled, device, error: result.error, result })
      trackUsage(result.ok ? 'build_succeeded' : 'build_failed', machine)
    } catch (error) {
      if (operation.current !== request) return
      setView({ phase: 'failed', key, enabled, device, error: message(error, 'The build failed.') })
      // A refused sign-in is not a failed build; a rejected OS version name returns above without counting.
      if (started) trackUsage('build_failed', machine)
    }
  }
  function cancel() {
    ++operation.current
    client.current?.dispose(); client.current = null
    setEngaged(false); setLoaded(false); setAttempt(value => value + 1)
    setView({ phase: 'idle', key: '' })
  }
  return { state, check, build, cancel }
}

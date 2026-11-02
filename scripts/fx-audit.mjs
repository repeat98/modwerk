// Sound-quality audit for an effect: aliasing, DC, clipping, what it does after the input stops, and dead knobs or duplicate presets.
// Offline: no firmware, no module code.
//
//   npm run fx:audit -- plan <dir> [--tail <seconds>]        write the test signals and plan.json
//   npm run fx:audit -- check <dir> <renders> [options]      read your renders of those signals and judge them
//   npm run fx:audit -- compare <render> <render>... [options]  compare renders of one signal sample for sample, every pair
//   npm run fx:audit -- selftest                             prove the analysis on synthetic effects (a vitest test runs this too)
//
// Render each signal through the effect with the harness you already use, with the effect's knobs at their dearest setting and its
// modulation off, and put the output beside the same name in <renders> (.raw or .wav). Each signal is written both ways: raw
// little-endian int32 words holding 24-bit values, which dsp_host reads with -in (it copies mono to both channels and writes
// interleaved L R int32 to -out), and a 24-bit WAV for rig_render.py --stem. Renders read as either at 44.1 kHz.
// docs/module-guides/effects.md, "Sound quality", says what each line means and what to do about it.
//
// For compare, render `noise` once per setting: each knob at both ends with the rest fixed, or each preset, or one setting before and
// after a code change. A pair that is `same` is a knob that does nothing to the signal, or two presets that are one sound.
//
// options: --mono (raw renders are one channel)  --alias-limit <dBc>  --dc-limit <dBFS>  --idle-limit <dBFS>  --same-limit <dB>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { LIMITS, SAME_LIMIT, SAMPLE_RATE, analyzeIdle, analyzeTone, buildPlan, compareRenders, idleSamples, judgeIdle, judgeTone, noiseSamples, readAudio, selfTest, toneSamples, wavFile } from './fx-audit-analysis.mjs'

const args = process.argv.slice(2), positional = []
const options = {}
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--')) positional.push(args[i])
  else if (['--mono'].includes(args[i])) options[args[i].slice(2)] = true
  else if (['--tail', '--alias-limit', '--dc-limit', '--idle-limit', '--same-limit'].includes(args[i]) && args[i + 1] !== undefined && Number.isFinite(Number(args[i + 1]))) options[args[i].slice(2)] = Number(args[++i])
  else usage(args[i] + ' is not an option, or lacks its number')
}
const [command, ...paths] = positional

function usage(problem) {
  console.error((problem ? problem + '\n' : '') + 'Usage: npm run fx:audit -- plan <dir> [--tail <seconds>]\n       npm run fx:audit -- check <dir> <renders> [--mono] [--alias-limit <dBc>] [--dc-limit <dBFS>] [--idle-limit <dBFS>]\n       npm run fx:audit -- compare <render> <render>... [--mono] [--same-limit <dB>]\n       npm run fx:audit -- selftest')
  process.exit(2)
}

const raw = samples => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength)
const fixed = (value, width) => (value < -140 ? '<-140' : value.toFixed(1)).padStart(width)

if (command === 'plan' && paths.length === 1) {
  const dir = resolve(paths[0]), plan = buildPlan(options.tail ?? 3)
  mkdirSync(dir, { recursive: true })
  const write = (name, samples) => { writeFileSync(resolve(dir, name + '.raw'), raw(samples)); writeFileSync(resolve(dir, name + '.wav'), wavFile(samples)) }
  for (const tone of plan.tones) write(tone.file, toneSamples(tone.m, tone.levelDbfs))
  write(plan.idle.file, idleSamples(plan.idle.tailSeconds))
  write(plan.noise.file, noiseSamples(plan.noise.tailSeconds))
  writeFileSync(resolve(dir, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
  console.log('Wrote ' + (plan.tones.length + 2) + ' signals to ' + dir + ' (' + SAMPLE_RATE + ' Hz, mono), each as .raw (int32 words, for dsp_host -in) and .wav (24-bit, for rig_render.py --stem):')
  for (const tone of plan.tones) console.log('  ' + tone.file + '   ' + tone.hz.toFixed(1) + ' Hz at ' + tone.levelDbfs + ' dBFS')
  console.log('  ' + plan.idle.file + '   a burst, then ' + plan.idle.tailSeconds + ' s of silence')
  console.log('  ' + plan.noise.file + '  1 s of noise, then ' + plan.noise.tailSeconds + ' s of silence: for compare, one render per knob end or preset')
  console.log('\nRender each through the effect (knobs at their dearest, modulation off), keep the file name, then:\n  npm run fx:audit -- check ' + paths[0] + ' <renders>')
} else if (command === 'check' && paths.length === 2) {
  const dir = resolve(paths[0]), renders = resolve(paths[1]), limits = { alias: options['alias-limit'] ?? LIMITS.alias, dc: options['dc-limit'] ?? LIMITS.dc, idle: options['idle-limit'] ?? LIMITS.idle }
  if (!existsSync(resolve(dir, 'plan.json'))) usage('No plan.json in ' + dir + ': run plan first')
  const plan = JSON.parse(readFileSync(resolve(dir, 'plan.json'), 'utf8'))
  const find = name => ['.raw', '.wav'].map(extension => resolve(renders, name + extension)).find(path => existsSync(path))
  const missing = [...plan.tones, plan.idle].filter(item => !find(item.file)).map(item => item.file)
  if (missing.length) { console.error('No render in ' + renders + ' for: ' + missing.join(', ') + ' (.raw or .wav)'); process.exit(2) }
  const read = item => readAudio(find(item.file), { channels: options.mono ? 1 : 2 })
  let failed = 0
  const notes = []
  console.log('signal'.padEnd(22) + 'out dBFS'.padStart(10) + 'harmonics'.padStart(11) + 'aliasing'.padStart(10) + 'residual'.padStart(10) + 'DC dBFS'.padStart(10) + 'rails'.padStart(8) + '  verdict')
  for (const tone of plan.tones) {
    const results = read(tone).map(channel => analyzeTone(channel, tone)), worst = results.reduce((a, b) => b.aliasDbc > a.aliasDbc ? b : a)
    const lines = judgeTone({ ...worst, dcDbfs: Math.max(...results.map(r => r.dcDbfs)), rails: Math.max(...results.map(r => r.rails)) }, limits)
    const state = lines.some(line => line.state === 'fail') ? 'FAIL' : lines.some(line => line.state === 'note') ? 'note' : 'ok'
    if (state === 'FAIL') failed++
    console.log(tone.file.padEnd(22) + fixed(worst.levelDbfs, 10) + fixed(worst.harmonicsDbc, 11) + fixed(worst.aliasDbc, 10) + fixed(worst.residualDbc, 10) + fixed(Math.max(...results.map(r => r.dcDbfs)), 10) + String(Math.max(...results.map(r => r.rails))).padStart(8) + '  ' + state)
    for (const line of lines.filter(item => item.state !== 'ok')) notes.push(tone.file + ' ' + line.name + ': ' + line.detail)
  }
  const idle = read(plan.idle).map(analyzeIdle).reduce((a, b) => b.peakDbfs > a.peakDbfs ? b : a), verdict = judgeIdle(idle, limits)
  if (verdict.state === 'fail') failed++
  console.log(plan.idle.file.padEnd(22) + '  after the input stops: ' + verdict.detail + '  ' + verdict.state.toUpperCase())
  if (verdict.state === 'note') notes.push(plan.idle.file + ': ' + verdict.detail)
  for (const note of notes) console.log('  ' + note)
  console.log('\nlevels: harmonics, aliasing and residual are dBc to the fundamental. Aliasing is the energy where harmonics above Nyquist fold back; the residual is'
    + '\neverything else (noise, modulation sidebands, folds beyond the 128th harmonic). A time-varying effect leaves sidebands in the residual: turn its modulation off.')
  console.log(failed ? '\n' + failed + ' check(s) failed. The limits are audit defaults (aliasing ' + limits.alias + ' dBc, DC ' + limits.dc + ' dBFS, idle ' + limits.idle + ' dBFS); say in TESTING.md what you changed and why.' : '\nNo check failed. Record the table in TESTING.md.')
  process.exitCode = failed ? 1 : 0
} else if (command === 'compare' && paths.length >= 2) {
  const limit = options['same-limit'] ?? SAME_LIMIT, missing = paths.filter(path => !existsSync(resolve(path)))
  if (missing.length) usage('No render at: ' + missing.join(', '))
  const renders = paths.map(path => ({ name: basename(path), audio: readAudio(resolve(path), { channels: options.mono ? 1 : 2 }) }))
  const width = Math.max(...renders.map(render => render.name.length)) + 2
  console.log('render'.padEnd(width) + 'against'.padEnd(width) + 'difference'.padStart(11) + 'peak diff'.padStart(11) + 'first diff'.padStart(12) + '  verdict')
  const counts = {}
  for (let i = 0; i < renders.length; i++) for (let j = i + 1; j < renders.length; j++) {
    const result = compareRenders(renders[i].audio, renders[j].audio, limit)
    counts[result.verdict] = (counts[result.verdict] ?? 0) + 1
    const lengths = result.frames[0] === result.frames[1] ? '' : '  (lengths ' + result.frames.join(' and ') + ': compared over the shorter)'
    console.log(renders[i].name.padEnd(width) + renders[j].name.padEnd(width) + (fixed(result.differenceDb, 8) + ' dB').padStart(11)
      + (fixed(result.peakDbfs, 6) + ' dBFS').padStart(11) + (result.firstSeconds === null ? '-' : result.firstSeconds.toFixed(4) + ' s').padStart(12) + '  ' + result.verdict + lengths)
  }
  console.log('\ndifference: the two renders\' difference in dB to the louder one, worst channel. identical: every sample equal. same: at or below ' + limit + ' dB'
    + '\n(--same-limit), which nobody hears: two ends of one knob that are the same mean the knob does nothing to this signal; two presets that are'
    + '\nthe same are one sound. silent: neither render carries the signal, so the pair proves nothing: check the routing and the trigger.')
  if (counts.silent) console.log('\n' + counts.silent + ' silent pair(s): render again before reading anything into this table.')
} else if (command === 'selftest' && !paths.length) {
  const rows = selfTest()
  for (const row of rows) console.log((row.ok ? '  ok   ' : '  FAIL ') + row.name + ': ' + row.detail)
  process.exitCode = rows.every(row => row.ok) ? 0 : 1
} else usage(command ? 'Unknown or incomplete command: ' + positional.join(' ') : '')

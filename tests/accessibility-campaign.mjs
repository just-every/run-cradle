import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readdir, readFile, statfs, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { sanitizeEvidenceText } from './helpers/accessibility-redaction.mjs'

const repository = process.cwd()
const evidence = path.resolve(process.env.CRADLE_A11Y_OUTPUT ?? 'evidence/a11y-after')
const maxLoad = 36
const minFreeDiskBytes = 15 * 1024 ** 3
const suites = [
  { name: 'public-and-campaign-shell', file: 'tests/ui-cradle-browser.mjs', output: 'CRADLE_UI_EVIDENCE' },
  { name: 'records-builder', nodeArgs: ['--import', './tests/helpers/typescript-loader.mjs'], file: 'tests/ui-records-builder.mjs', output: 'CRADLE_RECORDS_OUTPUT' },
  { name: 'recut-records-forms', nodeArgs: ['--import', './tests/helpers/typescript-loader.mjs'], file: 'tests/ui-recut-final.mjs', output: 'CRADLE_RECUT_OUTPUT' },
  { name: 'base-import', nodeArgs: ['--import', './tests/helpers/typescript-loader.mjs'], file: 'tests/ui-base-import.mjs', output: 'CRADLE_IMPORT_OUTPUT' },
  { name: 'base-undo', nodeArgs: ['--import', './tests/helpers/typescript-loader.mjs'], file: 'tests/ui-base-undo.mjs', output: 'CRADLE_UNDO_OUTPUT' },
  { name: 'base-exits', nodeArgs: ['--import', './tests/helpers/typescript-loader.mjs'], file: 'tests/ui-base-exits.mjs', output: 'CRADLE_EXITS_OUTPUT' },
  { name: 'launch-authority', file: 'tests/ui-launch-authority-browser.mjs', output: 'CRADLE_AUTHORITY_EVIDENCE' },
  { name: 'launch-optional-fields', file: 'tests/ui-launch-optional-browser.mjs', output: 'CRADLE_OPTIONAL_EVIDENCE' },
  { name: 'launch-walkthrough', file: 'tests/ui-launch-walkthrough.mjs', output: 'CRADLE_LAUNCH_EVIDENCE' },
  { name: 'repairs', file: 'tests/ui-repairs-browser.mjs', output: 'CRADLE_UI_EVIDENCE' },
  { name: 'local-signin', file: 'tests/ui-local-signin.mjs', output: 'CRADLE_LOCAL_EVIDENCE' },
]
const source = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' })
assert.equal(source.status, 0, source.stderr || 'Cannot identify the audited source head.')
await mkdir(evidence, { recursive: true })
const receipt = {
  command: 'pnpm test:a11y',
  sourceHead: source.stdout.trim(),
  startedAt: new Date().toISOString(),
  node: process.version,
  mode: 'strict keyboard-driven browser audit; no capture-only mode',
  viewportWidths: [1440, 768, 390],
  suites: [],
}
const receiptPath = path.join(evidence, 'a11y-campaign-command.json')

async function machineGuard() {
  const [filesystem, load] = await Promise.all([statfs(repository), Promise.resolve(os.loadavg()[0])])
  const freeDiskBytes = Number(filesystem.bavail) * Number(filesystem.bsize)
  const freeMemoryBytes = os.freemem()
  const state = { load, maxLoad, freeMemoryBytes, freeDiskBytes, minFreeDiskBytes }
  assert.ok(load <= maxLoad, `Accessibility browser run requires load <= ${maxLoad}; measured ${load.toFixed(2)}.`)
  assert.ok(freeDiskBytes >= minFreeDiskBytes, `Accessibility browser run requires at least 15 GiB free; measured ${(freeDiskBytes / 1024 ** 3).toFixed(2)} GiB.`)
  return state
}

async function redactEvidenceTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await redactEvidenceTree(file)
      continue
    }
    const name = entry.name.toLowerCase()
    const evidenceReceipt = /(?:^a11y-|receipt|results|accessibility|failure|keyboard)/.test(name)
    if (!evidenceReceipt && !name.endsWith('.log')) continue
    if (!/\.(?:json|log|txt|md)$/.test(name)) continue
    const source = await readFile(file, 'utf8')
    const safe = sanitizeEvidenceText(source)
    if (safe !== source) await writeFile(file, safe)
  }
}

for (const suite of suites) {
  const machine = await machineGuard()
  const output = path.join(evidence, suite.name)
  await mkdir(output, { recursive: true })
  const env = { ...process.env, CRADLE_A11Y: '1', CRADLE_A11Y_SOURCE_HEAD: receipt.sourceHead, [suite.output]: output }
  delete env.CRADLE_A11Y_CAPTURE_ONLY
  const args = [...(suite.nodeArgs || []), suite.file]
  let result
  try {
    result = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } finally {
    await redactEvidenceTree(output)
  }
  const safeStdout = sanitizeEvidenceText(result.stdout || '')
  const safeStderr = sanitizeEvidenceText(result.stderr || '')
  if (safeStdout) process.stdout.write(safeStdout)
  if (safeStderr) process.stderr.write(safeStderr)
  await writeFile(path.join(output, `a11y-${suite.name}-command.log`), safeStdout + safeStderr)
  const outcome = {
    suite: suite.name,
    command: `${process.execPath} ${args.join(' ')}`,
    output,
    machine,
    status: result.status,
    signal: result.signal,
    error: result.error?.message,
  }
  receipt.suites.push(outcome)
  await writeFile(receiptPath, JSON.stringify({ ...receipt, completedAt: result.status === 0 ? undefined : new Date().toISOString() }, null, 2))
  if (result.error || result.status !== 0) {
    process.exitCode = result.status ?? 1
    process.exit()
  }
}

receipt.completedAt = new Date().toISOString()
await redactEvidenceTree(evidence)
await writeFile(receiptPath, JSON.stringify(receipt, null, 2))
console.log(JSON.stringify({ command: receipt.command, sourceHead: receipt.sourceHead, suites: receipt.suites.length, evidence }))

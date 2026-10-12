import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRedaction, credentialValues } from '../../scripts/base-onboarding/redaction.mjs'
import { checkoutDevKey } from './dev-gate.mjs'

// Raw startup streams remain in memory. Save only a drained capture redacted
// with this installation's actual generated credentials and inherited values.
export async function saveInstallerStartupDiagnostic(copy, child, capture) {
  await capture.close
  const vars = await copy.readVars()
  const { AUTH_ORIGIN, APP_ORIGIN, ...bindings } = vars
  const known = [...new Set([
    ...credentialValues(bindings),
    ...credentialValues(copy.environment),
    await checkoutDevKey(copy.source),
  ].filter(Boolean))]
  const redactor = createRedaction()
  redactor.addSecrets(known)
  const raw = capture.output()
  const redacted = redactor.redact(raw)
  assert.ok(!known.some(value => redacted.includes(value)), 'Startup diagnostic must redact actual generated credential values')
  const diagnostic = {
    phase: 'dev startup',
    childClosed: capture.drained,
    exitCode: child.exitCode,
    signal: child.signalCode,
    outputBytes: Buffer.byteLength(raw),
    generatedAndInheritedCredentialValuesChecked: known.length,
    exactCredentialMatchesBeforeRedaction: known.reduce((count, value) => count + raw.split(value).length - 1, 0),
    exactCredentialMatchesAfterRedaction: 0,
    rawOutputWithheld: true,
    redactedTail: redacted.split('\n').slice(-40).join('\n'),
  }
  await writeFile(path.join(copy.root, 'dev-startup-diagnostic.json'), JSON.stringify(diagnostic, null, 2), { mode: 0o600 })
  return diagnostic
}

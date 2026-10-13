import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// The owning runtime removes its private temporary directory on failure/close.
export async function localRuntimeTls(directory) {
  const keyFile = path.join(directory, 'listener.key'), certFile = path.join(directory, 'listener.crt')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1',
    '-keyout', keyFile, '-out', certFile, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
  return { httpsKey: await readFile(keyFile, 'utf8'), httpsCert: await readFile(certFile, 'utf8') }
}

import { DatabaseSync } from 'node:sqlite';
import { canonical, hash } from './integrity.mjs';
export class Store {
  constructor(path) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS erased_artifacts(sha256 TEXT PRIMARY KEY,erased_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, state TEXT NOT NULL, request TEXT NOT NULL, result TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, job_id TEXT, event TEXT NOT NULL, at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS deployments(id TEXT PRIMARY KEY, build_id TEXT NOT NULL, source_hash TEXT NOT NULL, artifact_hash TEXT NOT NULL, state TEXT NOT NULL, request_hash TEXT NOT NULL);`);
  }
  nonce(nonce, expiresAt) { this.db.prepare('DELETE FROM nonces WHERE expires_at < ?').run(Date.now()); if(this.db.prepare('SELECT COUNT(*) AS n FROM nonces').get().n>=10000)throw new Error('request_capacity'); this.db.prepare('INSERT INTO nonces VALUES (?,?)').run(nonce, expiresAt); }
  submit(request) {
    const bytes = canonical(request), digest = hash(bytes), prior = this.get(request.jobId);
    if (prior) { if (prior.input_hash !== digest) throw new Error('idempotency_conflict'); return prior; }
    if(this.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n>=1000)throw new Error('job_store_capacity');
    this.db.prepare('INSERT INTO jobs VALUES (?,?,?, ?,NULL,?,?)').run(request.jobId, digest, 'queued', bytes, Date.now(), Date.now());
    this.audit(request.jobId, 'queued'); return this.get(request.jobId);
  }
  get(id) { const row = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id); return row ? { ...row, request: JSON.parse(row.request), result: row.result ? JSON.parse(row.result) : null } : null; }
  queued() { return this.db.prepare("SELECT id FROM jobs WHERE state='queued' ORDER BY created_at,id").all().map(r => this.get(r.id)); }
  claim(id) { return this.db.prepare("UPDATE jobs SET state='running',updated_at=? WHERE id=? AND state='queued'").run(Date.now(), id).changes === 1; }
  finish(id, state, result) {
    const changed = this.db.prepare("UPDATE jobs SET state=?,result=?,updated_at=? WHERE id=? AND state='running'").run(state, canonical(result), Date.now(), id).changes;
    if (changed) this.audit(id, state); return changed === 1;
  }
  cancel(id) { const changed = this.db.prepare("UPDATE jobs SET state='cancelled',updated_at=? WHERE id=? AND state IN ('queued','running')").run(Date.now(), id).changes; if (changed) this.audit(id, 'cancelled'); return this.get(id); }
  interrupted() { return this.db.prepare("SELECT id FROM jobs WHERE state='running'").all().map(r => r.id); }
  audit(id, event) { this.db.prepare('INSERT INTO audit(job_id,event,at) VALUES (?,?,?)').run(id, event, Date.now()); }
  deploy(value) {
    const previous = this.deployment(value.id), digest = hash(canonical(value));
    if (previous) { if (previous.request_hash !== digest) throw new Error('idempotency_conflict'); return previous; }
    if(this.db.prepare('SELECT COUNT(*) AS n FROM deployments').get().n>=1000)throw new Error('deployment_store_capacity');
    this.db.prepare('INSERT INTO deployments VALUES (?,?,?,?,?,?)').run(value.id, value.buildId, value.sourceHash, value.artifactHash, 'prepared', digest);
    return this.deployment(value.id);
  }
  deployment(id) { return this.db.prepare('SELECT * FROM deployments WHERE id=?').get(id) ?? null; }
  activate(id) { this.db.prepare("UPDATE deployments SET state='active' WHERE id=? AND state='prepared'").run(id); }
  stopDeployment(id) { this.db.prepare("UPDATE deployments SET state='stopped' WHERE id=?").run(id); }
  close() { this.db.close(); }
}

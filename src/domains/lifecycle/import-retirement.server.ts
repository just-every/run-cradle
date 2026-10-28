import {nativeTallyBefore} from './import-tally.server'
// Cradle owns atomic retirement across multiple imported bases.
import { randomUUID } from 'node:crypto';
import type { D1CustodyRetirement, D1ErasureJournalEntry, D1ImportContext, D1ImportPerson, D1Sql } from '../../../vendor/base/modules/import-kit/src/d1/types.ts';
import { requestContext, packGuards, remaining, D1RequestLimitError } from '../../../vendor/base/modules/import-kit/src/d1/budget.ts';
import { authority, authorize, finalGuard, finalAuthority, readonlyChecks, prepare, readAtomic, sql } from '../../../vendor/base/modules/import-kit/src/d1/database.ts';
import { requireText } from '../../../vendor/base/modules/import-kit/src/provenance/identity.ts';
import { targetErasure } from '../../../vendor/base/modules/import-kit/src/d1/erasure.ts';
import { headerAbsence, retirementScope, retirementWrites, scopeGuards } from '../../../vendor/base/modules/import-kit/src/d1/retirement-scope.ts';
import { tallyJournal, tallyStores } from '../../../vendor/base/modules/import-kit/src/d1/retirement-tally.ts';
import { fieldRedactions } from '../../../vendor/base/modules/import-kit/src/d1/field-redaction.ts';

/** Erase a person from import custody and journal it, in one D1 batch with the
 * product's native statements.
 *
 * Their records (by exact native target) become zero-effect tombstones in every
 * job, so undo and resume of everyone else's records keep working. A job or
 * stream whose header holds one of the person's exact values cannot be renamed
 * without breaking its source identities, so its whole custody is retired: no
 * undo or resume, a plain retirement row naming the journal receipt, and the
 * native rows it already wrote stay. Retirement closes over the streams, reused
 * sources and preserved history that depend on a retired job. The journal row
 * holds the receipt id, row counts per store and the time, never a value.
 *
 * `checkpoint` is the product's restore fence for rewritten rows (portability's
 * redaction checkpoint). It commits in the batch whenever the batch rewrites or
 * retires custody, so an archive older than the erasure is refused whole once
 * the later journal is supplied; a batch without it proves no custody row changed. */
export async function retireD1ImportCustody(person: D1ImportPerson, nativeStatements: D1Sql[], input: D1ImportContext, checkpoint: D1Sql[], companions: { person: D1ImportPerson; context: D1ImportContext }[] = [], finalGuards: D1Sql[] = []): Promise<D1CustodyRetirement> {
  const originalDatabase = input.storage.database;
  if (companions.some(c => c.context.storage.database !== originalDatabase)) throw new Error('IMPORT_RETIREMENT_DATABASE_MISMATCH');
  input = requestContext(input);
  companions = companions.map(c => ({ ...c, context: { ...c.context, storage: { ...c.context.storage, database: input.storage.database } } }));
  const prepared = await prepareD1ImportCustodyRetirement(person, nativeStatements, input, checkpoint);
  const rest = [];
  for (const companion of companions) rest.push(await prepareD1ImportCustodyRetirement(companion.person, [], companion.context, checkpoint));
  const all = [prepared, ...rest];
  if (new Set(all.map(p => p.context.destination)).size !== all.length) throw new Error('IMPORT_RETIREMENT_DUPLICATE_DESTINATION');
  if (all.some(p => p.context.storage.database !== input.storage.database)) throw new Error('IMPORT_RETIREMENT_DATABASE_MISMATCH');
  // Every scope is read without writes. All before-images precede any native or
  // custody change; one failure rolls back the admission and every destination.
  const prefix = all.flatMap(p => p.prefix), suffix = all.flatMap(p => p.suffix);
  const statements = [...prefix, ...nativeStatements, ...prepared.fence, ...suffix, ...finalGuards.map(finalGuard), ...all.map(p => finalAuthority(p.context, 'erase'))];
  if (statements.length > Math.min(1000, ...all.map(p => remaining(p.context)))) throw new D1RequestLimitError();
  const db = input.storage.database;
  const results = await db.batch(statements.map(statement => prepare(db, statement)));
  const [journal] = await readJournal(db, input.destination, prepared.receiptId);
  return { ...journal, phase: 'complete', fieldMatches: all.flatMap(p => p.fieldMatches), retiredJobs: all.flatMap(p => p.scope.jobs), retiredStreams: all.flatMap(p => p.scope.anchors), nativeResults: results.slice(prefix.length, prefix.length + nativeStatements.length) };
}

/** Cradle composition extension: read-only preparation for one atomic retirement
 * across independent destinations. The public helper remains the sole committer. */
async function prepareD1ImportCustodyRetirement(person: D1ImportPerson, nativeStatements: D1Sql[], input: D1ImportContext, checkpoint: D1Sql[]) {
  person = { ...person, related: person.related ? { ...person.related, fields: fieldRedactions(person.related.fields) } : undefined };
  const context = requestContext({ ...input, originalErasurePolicy: input.originalErasurePolicy ?? 'withdraw-affected-artifacts' });
  if (context.maxBatchBytes !== undefined) throw new Error('IMPORT_RETIREMENT_UNBOUNDED_ONLY');
  const values = [...new Set(person.values ?? [])].sort();
  for (const value of values) requireText(value, 'person value');
  if (person.target) { requireText(person.target.kind, 'target kind'); requireText(person.target.id, 'target id'); }
  if (!person.target && !values.length) throw new Error('IMPORT_RETIREMENT_PERSON_REQUIRED');
  if (person.related && !person.target) throw new Error('IMPORT_RETIREMENT_TARGET_REQUIRED');
  await readAtomic(context, [], undefined, 'erase');
  const db = context.storage.database, destination = context.destination;
  const scope = await retirementScope(db, destination, values), retiring = new Set(scope.jobs);
  const fenced = Boolean(person.target) || scope.jobs.length + scope.streams.length + scope.stages.length + scope.anchors.length > 0;
  if (fenced && !checkpoint.length) throw new Error('IMPORT_RETIREMENT_CHECKPOINT_REQUIRED');
  const fence = fenced ? checkpoint : [];
  // Only the checkpoint fences rows the tally does not count (another import's jobs, a seed's tables): unfenced caller SQL is refused.
  if (nativeStatements.length && !fence.length) throw new Error('IMPORT_RETIREMENT_NATIVE_REQUIRES_CHECKPOINT');
  const erasure = person.target ? await targetErasure(person.target, context, person.related, retiring) : { before: [], after: [], final: [], decisions: [], jobs: [], fieldMatches: [] };
  const receiptId = randomUUID(), recordedAt = new Date().toISOString();
  const touched = { destination, jobs: [...new Set([...erasure.jobs, ...scope.jobs])].sort(), streams: [] as string[] };
  touched.streams = [...new Set([...scope.anchors, ...(await db.prepare('SELECT DISTINCT stream_id AS id FROM ik_d1_stream_pages WHERE job_id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(touched.jobs)).all<{ id: string }>()).results.map(row => row.id)])].sort();
  const stores = await tallyStores(db);
  const entry = { recordedAt, recordsErased: erasure.decisions.length, jobsRetired: scope.jobs.length, streamsRetired: scope.anchors.length };
  const prefix = packGuards([authority(context, 'erase'), ...nativeTallyBefore(stores, receiptId, touched), ...erasure.before, ...scopeGuards(scope)]);
  const suffix = [...packGuards([...erasure.after, ...retirementWrites(scope, destination, receiptId, recordedAt), ...headerAbsence(destination, values),
    ...tallyJournal(stores, receiptId, touched, entry, fenced), authority(context, 'erase'), sql('DELETE FROM ik_d1_assertions')]), ...readonlyChecks(erasure.final), finalAuthority(context, 'erase')];
  if (prefix.length + nativeStatements.length + fence.length + suffix.length > remaining(context)) throw new D1RequestLimitError();
  return { context, prefix, suffix, fence, receiptId, scope, fieldMatches: erasure.fieldMatches };
}

async function readJournal(db: D1ImportContext['storage']['database'], destination: string, receiptId?: string): Promise<D1ErasureJournalEntry[]> {
  const { results } = await db.prepare(`SELECT * FROM ik_d1_erasure_journal WHERE destination=?${receiptId ? ' AND id=?' : ''} ORDER BY recorded_at, id`).bind(...[destination, receiptId].filter(value => value !== undefined)).all<any>();
  return results.map(row => ({ receiptId: row.id, destination: row.destination, recordedAt: row.recorded_at, recordsErased: row.records_erased, jobsRetired: row.jobs_retired, streamsRetired: row.streams_retired, stores: JSON.parse(row.stores_json) }));
}


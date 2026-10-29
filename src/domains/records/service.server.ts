import { createTemplateButtons } from './templates/buttons.server';
import { createRecordTemplates } from './templates/service.server';
import type { RecordMutationEffects, RecordNoticeEffects } from './effects.server';
import type { RecordAttachmentPort } from './attachments.server';
import type { DescriptorRegistry } from './descriptors.server';
import type { PolicyPort } from '../authority/ports';
import type { RecordDetailPort } from './query.server';
import { createRecordReader } from './query.server';
import { createRecordWriter } from './change.server';
import { createRecordMetadata } from './metadata.server';
import { createBulkService } from './bulk.server';
import { createRecordSearch } from './search.server';
import { createRecordPresence } from './presence.server';
import { validateExpressionGraph } from './formulas';
export function createRecordServices(db: D1Database, descriptors: DescriptorRegistry, policy: PolicyPort, cursorSecret: string, details?: RecordDetailPort, attachments?: RecordAttachmentPort, effects?: RecordMutationEffects, notices?: RecordNoticeEffects) { validateExpressionGraph(descriptors.list().map(d => d.schema)); const reader = createRecordReader(db, descriptors, policy, cursorSecret, details, attachments), writer = createRecordWriter(db, descriptors, policy, reader, attachments, effects, notices), metadata = createRecordMetadata(db, descriptors, policy, reader, cursorSecret), bulk = createBulkService(db, reader, writer, policy, cursorSecret); const templates=createRecordTemplates(db,{reader,writer,descriptors,policy},attachments); const templateButtons=createTemplateButtons(db,{policy,descriptors,reader,templates}); return { templateButtons, templates, reader, writer, metadata, bulk, descriptors, policy, presence: createRecordPresence(db, policy, metadata), search: createRecordSearch(descriptors, policy, reader) }; }

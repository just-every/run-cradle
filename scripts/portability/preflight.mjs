import {PortabilityError} from '@runeditrun/rer/modules/portability';
import {fileRecords} from '@runeditrun/rer/modules/portability/files';

export async function preflightImport(path,journal){
 // Authenticate both complete archives before preparing generated record tables.
 for(const file of [path,journal].filter(Boolean)){
  let manifest;
  for await(const record of fileRecords(file))if(record.kind==='manifest')manifest=record;
  // Base's v2 reader authenticates the array; its restore fence checks entries
  // only after staging. Match the strict tombstone shape before schema setup.
  if(!manifest.journal.every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)))throw new PortabilityError('invalid_journal',409);
 }
}

export function transferFailure(error){
 const refused=error instanceof PortabilityError&&(error.status===409||['wrong_product','schema_mismatch','table_inventory','configuration_inventory','erased_row','erasure_epoch','later_journal','invalid_journal'].includes(error.code.split(':')[0]));
 const exitCode=error.message==='archive_json'?2:refused||error.code==='EEXIST'?4:1;
 const reason=error instanceof PortabilityError?error.code.split(':')[0]:/^[A-Z_]+$/.test(error.code??'')?error.code:error.message==='archive_json'?'archive_json':/D1_ERROR/.test(error.message??'')?'database_error':'native_error';
 const fileId=error instanceof PortabilityError&&['stored_file_missing','stored_file_checksum'].includes(reason)?error.code.split(':')[1]:undefined;
 const names=error instanceof PortabilityError&&reason==='unsafe_integer'?error.code.split(':').slice(1):[];
 const location=names.length===2&&names.every(name=>/^[a-z_][a-z0-9_]{0,63}$/.test(name))?names.join('.'):undefined;
 const frames=reason==='native_error'||reason==='database_error'?[...new Set([...String(error.stack??'').matchAll(/\/(catalogue|copies|export|import|storage|format|worker|files|generated)\.mjs:(\d+):\d+/g)].map(match=>match[1]+'.mjs:'+match[2]))].slice(0,3):[];
 return {ok:false,code:exitCode===2?'invalid_archive':exitCode===4?'restore_refused':'transfer_failed',reason,...(location?{location}:{}),...(fileId&&/^[A-Za-z0-9_-]{1,128}$/.test(fileId)?{location:'file '+fileId}:{}),...(frames.length?{frames}:{}),exitCode};
}

import './helpers/typescript-loader.mjs'
import assert from 'node:assert/strict'
import {contract} from './contract.mjs'
import {migratedD1} from './helpers/sqlite-d1.mjs'
import {assertReadOnlyPreview} from './helpers/records-import-preview-auth.mjs'
contract('RECORDS-005 BASE-SEC-003 BASE-INPUT-001','real Base cookie plus existing session projection makes HTTP over-limit preview fully read only and revocation fails closed',async()=>{
 const h=migratedD1();try{await assertReadOnlyPreview(h,()=>h.sql.prepare('SELECT total_changes() n').get().n)}finally{h.close()}
})

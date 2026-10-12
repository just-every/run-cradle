import {test} from 'node:test'
import {harness} from './helpers/records-manual-harness.mjs'
import {csvFenceScenario} from './helpers/records-csv-fence-scenario.mjs'
test('RECORDS-001 RECORDS-004 205-row CSV final fence fits D1 and rejects stale last row and final session revocation',async()=>{
 const h=await harness();try{await csvFenceScenario(h)}finally{h.close()}
})

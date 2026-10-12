import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const inventory=JSON.parse(await readFile('scripts/base-cli/inventory.json','utf8'));
let files=0;
for(const [prefix,entries]of [['scripts/base-cli/',inventory.files],['scripts/base-onboarding/',inventory.onboardingFiles]]){
 for(const [path,record]of Object.entries(entries)){
  assert.equal(createHash('sha256').update(await readFile(prefix+path)).digest('hex'),record.sha256,'Shared source differs: '+prefix+path);files++;
 }
}
console.log(`Base CLI/onboarding copy check: ${files} exact files`);

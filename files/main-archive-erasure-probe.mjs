import assert from 'node:assert/strict';
import {launchAuthorityRuntime} from '/home/agent/rer-consolidation/work/sd-cradle-c-f209/main-probe/tests/helpers/launch-authority-runtime.mjs';
import {customFieldDeletionFixture} from '/home/agent/rer-consolidation/work/sd-cradle-c-f209/run-cradle/tests/helpers/launch-custom-field-deletion.mjs';
import {lifecycleDoors} from '/home/agent/rer-consolidation/work/sd-cradle-c-f209/main-probe/tests/helpers/launch-operator-lifecycle.mjs';
const h=await launchAuthorityRuntime({}, {installedLaunchDefinitions:true,installationOwner:true});
try {
 const f=await customFieldDeletionFixture(h,()=>h.ownerSession,h.owner,'diagnostic');
 await f.storedRows(); await f.storedRows();
 console.log('SNAPSHOTS',await h.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name GLOB 'rer_portability_snap_*'").first('n'));
 const d=lifecycleDoors(h,h.ownerSession),p=await h.addPerson({name:'Archive erasure control'});
 await d.commit('member.remove',{memberId:p.id,reason:'Diagnostic erasure'},d.memberRef(await d.member(p.id)));
 const result=await d.command('member.erase',{memberId:p.id,reason:'Diagnostic erasure'},d.memberRef(await d.member(p.id)));
 console.log('ERASURE_RESULT',JSON.stringify(result));
 assert.equal(result.status,200,JSON.stringify(result.body));
} finally {await h.close();}

# Retained current-main before evidence

Input supplied by SD/CT in the immutable 2026-11-06 scope disposition; NOT rerun in this builder. Root reports independent verification of all 132 original artifact lengths and SHA256 values. This builder does not possess those 132 original files and does not claim to have revalidated them.

Native unchanged-main Worker: 6e9e8d18245e8eb2d3a9bf0cca8e4c07c056f746. Fixture helper came from f209 product ed307c7bf56f7b2cd3e1f8cec7264489c21c6a2f. Original run ended 05:16:09Z. Fixture dependency and old absolute paths are provenance, not required local checkouts. Historical candidate901/main897 are not current capacity measurements.

Supplied script (verbatim):

```javascript
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
```

Supplied result (terminal color codes omitted):

```text
SNAPSHOTS 916
ERASURE_RESULT {"status":500,"body":{"error":{"requestId":"01M6QJVSE6YVAFE4FM34HVGGPS","operation":"POST /api/v1/commands/member.erase","code":"internal","message":"The operation could not be completed.","retry":"never"}}}
AssertionError [ERR_ASSERTION]: {"error":{"requestId":"01M6QJVSE6YVAFE4FM34HVGGPS","operation":"POST /api/v1/commands/member.erase","code":"internal","message":"The operation could not be completed.","retry":"never"}}
500 !== 200
at file:///tmp/main-archive-erasure-probe.mjs:14:9
Node.js v22.20.0
```

Root attributes the native failure to IMPORT_D1_REQUEST_LIMIT. No production fix was attributed to f209.

The complete inline script and log, including the provided terminal color sequences, are also transcribed into retained-before-script.mjs and retained-before-log.txt. These are copies of the shipped evidence, not files recovered from the historical machine and not new executions. The original fixture helper retrieved read-only at ed307c7 is retained-fixture-original.mjs; only its two module import locations change in retained-fixture-adapted.mjs.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness,base,quoted} from './repairs-harness.mjs';
test('AUD threshold, exact approved quote, terminal decision race and material-change invalidation',async()=>{const h=await harness();try{const b=await base(h),q=await quoted(h,b,'200001'),{r,run,ref,db}=h;const selected=await run('repair.select-quote',{quoteId:q.quote},[ref('quotes',q.quote),ref('workOrders',q.work)]),decision=selected.value.decision;assert.ok(decision);assert.equal(decision.assigneeId,h.manager);assert.equal(decision.impact.spend[0].minor,'200001');const input={decisionId:decision.id,outcome:'approve',rationale:'Repair scope and tax checked',confirmedInputHash:decision.exactInputHash};await assert.rejects(run('decision.outcome',input,[ref('decisions',decision.id)]),/designated human/);const manager={...h.ctx,principal:{...h.ctx.principal,id:h.manager,humanId:h.manager}};await assert.rejects(run('decision.outcome',{...input,confirmedInputHash:'a'.repeat(64)},[ref('decisions',decision.id)],manager),/does not match/);const a=await h.prepare('decision.outcome',input,[ref('decisions',decision.id)],manager),bplan=await h.prepare('decision.outcome',{...input,outcome:'reject',rationale:'Prefer replacement'},[ref('decisions',decision.id)],manager);const results=await Promise.allSettled([h.admission.commit(manager,a.plan),h.admission.commit(manager,bplan.plan)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const committed=results[0].status==='fulfilled'?a:bplan;const before=await h.snapshot();const replay=await h.actions.execute(manager,'decision.outcome',committed.command);assert.equal(replay.replay,true);assert.deepEqual(await h.snapshot(),before);await assert.rejects(h.actions.execute(manager,'decision.outcome',{...committed.command,input:{...committed.command.input,rationale:'Changed payload'}}),/different canonical/);const outcome=await db.prepare('SELECT lifecycle FROM business_decisions WHERE id=?').bind(decision.id).first();if(outcome.lifecycle==='approved'){await db.prepare("UPDATE repair_contractors SET payee_id='changed',version=version+1 WHERE id=?").bind(b.contractor).run();await assert.rejects(run('repair.book-visit',{quoteId:q.quote,slot:{start:q.slot.start,end:q.slot.end},connectionId:r.createUlid(),approvalId:decision.id},[ref('quotes',q.quote),ref('workOrders',q.work)]),/payee changed/);}else assert.equal(outcome.lifecycle,'rejected');}finally{await h.close();}});
test('foreign currency cannot be compared with AUD; no grant means no exact-threshold selection',async()=>{const h=await harness();try{const b=await base(h),q=await quoted(h,b),{ref,db}=h;await db.prepare("UPDATE repair_quotes SET currency='GBP' WHERE id=?").bind(q.quote).run();await assert.rejects(h.run('repair.select-quote',{quoteId:q.quote},[ref('quotes',q.quote),ref('workOrders',q.work)]),/AUD conversion/);await db.prepare("UPDATE repair_quotes SET currency='AUD' WHERE id=?").bind(q.quote).run();const selected=await h.prepare('repair.select-quote',{quoteId:q.quote},[ref('quotes',q.quote),ref('workOrders',q.work)]);await db.exec('UPDATE test_authority SET active=0');const snapshot=await h.snapshot();await assert.rejects(h.admission.commit(h.ctx,selected.plan),{code:'version_conflict'});assert.deepEqual(await h.snapshot(),snapshot);}finally{await h.close();}});
test('request change keeps rationale and requires a fresh exact approval for revised quote follow-through', async () => {
  const h = await harness();
  try {
    const b = await base(h), q = await quoted(h, b, '245000'), {r, run, ref, db} = h;
    const selected = await run('repair.select-quote', {quoteId:q.quote}, [ref('quotes', q.quote), ref('workOrders', q.work)]);
    const decision = selected.value.decision;
    const manager = {...h.ctx, principal:{...h.ctx.principal, id:h.manager, humanId:h.manager}};
    const commands = r.createCommandRegistry(h.admission);
    r.registerRepairCommands(commands, h.d);
    // Exercise the production HTTP handlers with the existing isolated D1 fixture.
    // Authentication, case authority and execution remain fixture ports, not native-runtime proof.
    const post = async (action, input, expected, context = h.ctx, status = 200) => {
      const http = r.createCommandHttp({commands, admission:h.admission, authenticate:async () => context});
      const response = await http.request('/api/v1/commands/' + action, {
        method:'POST', headers:{'content-type':'application/json'},
        body:JSON.stringify(await h.envelope(input, expected)),
      });
      const body = await response.json();
      assert.equal(response.status, status, JSON.stringify(body));
      return body.data;
    };
    const reads = r.createRepairHttp(h.d, async () => manager);
    const read = async path => {
      const response = await reads.request('/api/v1/' + path);
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      return body.data;
    };
    const rationale = 'Please include insulation replacement';
    const outcome = {decisionId:decision.id, outcome:'request_change', rationale, confirmedInputHash:decision.exactInputHash};
    const unchanged = await h.snapshot();
    await post('decision.outcome', {...outcome, rationale:'   '}, [ref('decisions', decision.id)], manager, 400);
    assert.deepEqual(await h.snapshot(), unchanged);
    const changed = await post('decision.outcome', outcome, [ref('decisions', decision.id)], manager);
    assert.equal(changed.value.state, 'in_review');
    assert.equal(changed.value.decidedAt, null);
    const review = await read('decisions/' + decision.id + '/review');
    assert.equal(review.decision.state, 'in_review');
    assert.equal(review.decision.rationale, rationale);
    assert.equal(review.decision.decidedAt, null);
    assert.equal(review.decision.decidedBy, null);
    assert.equal(review.quote.state, 'superseded');
    const work = () => db.prepare('SELECT lifecycle,quote_id FROM repair_work_orders WHERE id=?').bind(q.work).first();
    assert.deepEqual(await work(), {lifecycle:'quotes', quote_id:null});
    assert.deepEqual((await db.prepare('SELECT id FROM repair_visits WHERE work_order_id=?').bind(q.work).all()).results, []);
    const inReview = await read('decisions?state=in_review');
    assert.ok(inReview.items.some(item => item.id === decision.id && item.rationale === rationale));

    // A change request is neither approval nor an autonomous scheduling command.
    const afterChange = await h.snapshot();
    const booking = {quoteId:q.quote, slot:{start:q.slot.start, end:q.slot.end}, connectionId:r.createUlid(), approvalId:decision.id};
    await post('repair.book-visit', booking, [ref('quotes', q.quote), ref('workOrders', q.work)], h.ctx, 409);
    await post('decision.outcome', {...outcome, outcome:'approve'}, [ref('decisions', decision.id)], manager, 409);
    assert.deepEqual(await h.snapshot(), afterChange);
    assert.deepEqual((await db.prepare('SELECT * FROM admission_outbox').all()).results, []);

    const total = {minor:'260000', currency:'AUD', scale:2};
    const revised = await post('repair.record-quote', {
      workOrder:await ref('workOrders', q.work), contractor:await ref('contractors', b.contractor),
      scopeHash:review.quote.scopeHash, total, taxIncluded:true,
      lineItems:[{description:'Restore cooling including insulation replacement', total}], exclusions:[],
      expiresAt:'2099-01-01T00:00:00.000Z', evidence:[b.ev], offeredSlot:q.slot,
    }, [ref('workOrders', q.work)]);
    const next = await post('repair.select-quote', {quoteId:revised.value.id}, [ref('quotes', revised.value.id), ref('workOrders', q.work)]);
    const fresh = next.value.decision;
    assert.notEqual(fresh.id, decision.id);
    assert.notEqual(fresh.exactInputHash, decision.exactInputHash);
    assert.equal(fresh.state, 'awaiting');
    assert.equal(fresh.assigneeId, h.manager);
    assert.equal(fresh.subject.ref.recordId, revised.value.id);
    assert.equal(fresh.impact.spend[0].minor, total.minor);
    assert.deepEqual(await work(), {lifecycle:'approval', quote_id:revised.value.id});
    const awaiting = await h.snapshot();
    await post('repair.book-visit', {...booking, quoteId:revised.value.id}, [ref('quotes', revised.value.id), ref('workOrders', q.work)], h.ctx, 409);
    const approve = {decisionId:fresh.id, outcome:'approve', rationale:'Revised insulation scope checked', confirmedInputHash:fresh.exactInputHash};
    await post('decision.outcome', approve, [ref('decisions', fresh.id)], h.ctx, 403);
    await post('decision.outcome', {...approve, confirmedInputHash:decision.exactInputHash}, [ref('decisions', fresh.id)], manager, 409);
    assert.deepEqual(await h.snapshot(), awaiting);
    await post('decision.outcome', approve, [ref('decisions', fresh.id)], manager);
    const approved = await read('decisions/' + fresh.id + '/review');
    assert.equal(approved.decision.state, 'approved');
    assert.equal(approved.decision.decidedBy.id, h.manager);
    assert.ok(approved.decision.decidedAt);
    assert.equal(approved.quote.id, revised.value.id);
    assert.equal(approved.quote.state, 'selected');
    assert.deepEqual(await work(), {lifecycle:'booking', quote_id:revised.value.id});
    assert.equal((await read('decisions/' + decision.id)).rationale, rationale);
  } finally {
    await h.close();
  }
});

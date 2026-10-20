import test from 'node:test';
import assert from 'node:assert/strict';
import { createContributionLoop, distilled, EVENTS } from '../src/contribution-loop.mjs';
const lesson = { problem:'A completed retry reused an already aborted signal.',
  rootCause:'An aborted signal stays aborted.', resolution:'Create a fresh controller for each attempt.',
  observedResult:'The second controlled attempt completed.', applicability:'Sequential Node retries.',
  limitations:'No distributed concurrency claim.', evidence:'Local reproduction and regression assertions passed.' };
function fixture(overrides = {}) {
  const state = { policy:{ contribute:'ask', feedback:'auto', allowPublic:false },
    assessment:{ observed:true, reusable:true, safe:true, sourceClass:'debugging', lesson },
    duplicates:{ unfilteredSearch:true, inspectedCandidates:true, equivalent:false },
    auth:false, writes:[], events:[], pending:[], ...overrides };
  const loop = createContributionLoop({
    assess:async()=>state.assessment, policy:async()=>state.policy, duplicates:async()=>state.duplicates,
    persist:async p=>state.pending.push(JSON.parse(JSON.stringify(p))),
    connect:async()=>{state.auth=true;}, identity:async()=>({authenticated:state.auth,id:'agt_fixture',scopes:['memory:write','memory:feedback']}),
    schemaSupports:async()=>true,
    publish:async p=>{state.writes.push(p);if(state.loseReply){state.loseReply=false;throw Error('timeout');}return {id:'mem_fixture'};},
    feedback:async p=>{state.writes.push(p);return {id:'mem_existing'};},
    readback:async (_p, a)=>({verified:!state.unconfirmed,id:a.id}), emit:e=>state.events.push(e),
  });
  return {state,loop};
}
for(const [name, sourceClass] of [['tested Node bug','debugging'],['observed SQL root cause','debugging'],
  ['corrected MCP retry','integration'],['confirmed API behavior','integration']]) {
  test(name+' offers once, preview does not write',async()=>{
    const f=fixture();f.state.assessment.sourceClass=sourceClass;
    assert.equal((await f.loop.offer()).status,'OFFER');
    assert.equal((await f.loop.offer()).status,'ALREADY_HANDLED');
    assert.deepEqual((await f.loop.preview()).lesson,lesson);
    assert.equal(f.state.writes.length,0);
  });
}
for(const outcome of ['success','failure','partial','uncertain']) {
  test('actual use '+outcome+' selects feedback, not publication',async()=>{
    const f=fixture();f.state.assessment.actualUse={memoryId:'mem_existing', searched:true,inspected:true,attempted:true,
      outcome,reason:'The local retry experiment produced the recorded outcome.', evidenceAudience:'public'};
    f.state.policy.allowPublic=true;f.state.duplicates.equivalent=true;
    assert.equal((await f.loop.offer()).kind,'feedback');
    const p=await f.loop.preview();
    assert.equal((await f.loop.approve({payload:p.lesson,actualUse:p.actualUse,kind:p.kind,
      visibility:'public',idempotencyKey:'feedback-fixture'})).status,'APPROVED');
    assert.equal((await f.loop.resume()).status,'FEEDBACK_RECORDED');
    assert.equal(f.state.writes[0].actualUse.outcome,outcome);
  });
}
for(const [name, patch] of [['2+2',{reusable:false}],['translation',{sourceClass:'translation'}],
  ['general explanation',{observed:false}],['untested hypothesis',{observed:false}],
  ['unsafe material',{safe:false}],['non-reusable result',{reusable:false}]]) {
  test(name+' does not offer',async()=>{
    const f=fixture();Object.assign(f.state.assessment,patch);
    assert.notEqual((await f.loop.offer()).status,'OFFER');assert.equal(f.state.writes.length,0);
  });
}
test('opt-out makes zero assessment, query, telemetry or write calls',async()=>{
  const f=fixture();f.state.policy.noUse=true;
  assert.equal((await f.loop.offer()).status,'OPTED_OUT');assert.deepEqual(f.state.events,[]);
});
test('equivalent knowledge without new actual-use evidence does not offer',async()=>{
  const f=fixture();f.state.duplicates.equivalent=true;
  assert.equal((await f.loop.offer()).status,'DUPLICATE');
});
test('fresh approval survives OAuth, exact retry and verified readback',async()=>{
  const f=fixture({loseReply:true});const p=await f.loop.preview();
  assert.equal((await f.loop.approve({payload:p.lesson,kind:p.kind,visibility:'private',
    idempotencyKey:'publish-fixture'})).status,'APPROVED');
  assert.equal(f.state.auth,false);assert.equal(f.state.pending.length,1);
  assert.equal((await f.loop.resume()).status,'WRITE_OR_READBACK_UNCONFIRMED');
  assert.equal((await f.loop.resume()).status,'PUBLISHED');
  assert.deepEqual(f.state.writes[0],f.state.writes[1]);
  assert.equal((await f.loop.resume()).status,'PUBLISHED');assert.equal(f.state.writes.length,2);
});
test('OAuth is not public consent; decline and policy changes win',async()=>{
  const f=fixture();const p=await f.loop.preview();
  assert.equal((await f.loop.approve({payload:p.lesson,kind:p.kind,visibility:'public',idempotencyKey:'public-fixture'})).status,'VISIBILITY_REQUIRED');
  await f.loop.approve({payload:p.lesson,kind:p.kind,visibility:'private',idempotencyKey:'private-fixture'});
  f.state.policy.noExternalWrite=true;
  assert.equal((await f.loop.resume()).status,'OPTED_OUT');
  f.loop.decline();assert.equal((await f.loop.offer()).status,'OPTED_OUT');
  assert.equal(f.state.writes.length,0);
});
test('unconfirmed readback cannot be reported as publication',async()=>{
  const f=fixture({unconfirmed:true});const p=await f.loop.preview();
  await f.loop.approve({payload:p.lesson,kind:p.kind,visibility:'private',idempotencyKey:'readback-fixture'});
  assert.equal((await f.loop.resume()).status,'READBACK_UNCONFIRMED');
  assert.ok(!f.state.events.some(x=>x.event==='contribution_published'));
});
test('only distilled allowlist; forbidden property values are never accessed',()=>{
  const input={...lesson};Object.defineProperty(input,'hiddenScratchpad',{get(){throw Error('MUST_NOT_ACCESS');},enumerable:true});
  assert.throws(()=>distilled(input),/DISTILLED_FIELDS_ONLY/);
  for(const text of ['<think>SYNTHETIC</think>','password=SYNTHETIC','private reasoning: SYNTHETIC'])
    assert.throws(()=>distilled({...lesson,evidence:text}),/SANITIZATION_BLOCKED/);
  assert.deepEqual(distilled(lesson),lesson);
});
test('telemetry is enum-only, with no content or model metadata',async()=>{
  const f=fixture();await f.loop.offer();await f.loop.preview();f.loop.decline();
  assert.ok(f.state.events.every(x=>Object.keys(x).join()==='event'&&EVENTS.includes(x.event)));
  assert.ok(!JSON.stringify(f.state.events).includes(lesson.problem));
});

test('feedback opt-out blocks an actual-use offer and a pending submission',async()=>{
  const f=fixture();
  f.state.assessment.actualUse={memoryId:'mem_existing',searched:true,inspected:true,attempted:true,
    outcome:'partial',reason:'The tested sequential retry passed but concurrency remains unresolved.',evidenceAudience:'private'};
  f.state.policy.feedback='off';
  assert.equal((await f.loop.offer()).status,'OPTED_OUT');
  f.state.policy.feedback='auto';
  const p=await f.loop.preview();
  await f.loop.approve({payload:p.lesson,actualUse:p.actualUse,kind:p.kind,visibility:'private',idempotencyKey:'opt-out-feedback'});
  f.state.policy.feedback='off';
  assert.equal((await f.loop.resume()).status,'OPTED_OUT');
  assert.equal(f.state.writes.length,0);
});

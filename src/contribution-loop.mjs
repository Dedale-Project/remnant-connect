// Copyright 2026 DÉDALE / Dedale-Project
// SPDX-License-Identifier: Apache-2.0
// Optional host adapter. The portable skill does not execute this module.
// Input is a locally assessed distilled result, NEVER a transcript or reasoning.
export const DISTILLED_FIELDS = Object.freeze([
  'problem', 'rootCause', 'resolution', 'observedResult', 'applicability', 'limitations', 'evidence',
]);
export const EVENTS = Object.freeze([
  'contribution_candidate_detected', 'contribution_offer_shown', 'contribution_previewed',
  'contribution_accepted', 'contribution_declined', 'contribution_published',
  'feedback_offer_shown', 'feedback_submitted', 'duplicate_detected', 'sanitization_blocked',
]);
const OUTCOMES = new Set(['success', 'failure', 'partial', 'uncertain']);
const CLASSES = new Set(['debugging', 'integration', 'migration', 'performance', 'research', 'development']);
const SENSITIVE = /(?:-----BEGIN [\w ]*PRIVATE KEY|Bearer\s+\S+|sk-[A-Za-z0-9_-]{16,}|(?:password|api[_ -]?key|token|secret)\s*[:=]\s*\S+|[A-Z]:\\Users\\|\/home\/[^/\s]+\/|[^\s@]+@[^\s@]+\.[^\s@]+|<think\b|hidden scratchpad|private reasoning|internal thoughts|reasoning tokens|chain.of.thought)/i;

/** Strict allowlist; reject unknown keys without reading their values. This scanner
 * is defense in depth. A trusted local privacy assessment is still required. */
export function distilled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Reflect.ownKeys(value).some(key => !DISTILLED_FIELDS.includes(key)))
    throw new Error('DISTILLED_FIELDS_ONLY');
  const result = {};
  for (const field of DISTILLED_FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string'
        || !descriptor.value.trim() || descriptor.value.length > 4000)
      throw new Error('INVALID_DISTILLED_FIELD');
    if (SENSITIVE.test(descriptor.value)) throw new Error('SANITIZATION_BLOCKED');
    result[field] = descriptor.value.trim();
  }
  return Object.freeze(result);
}

/** Construct once per significant resolution. The host owns policy, semantic
 * assessment, duplicate search/inspection, secure persistence and OAuth. */
export function createContributionLoop({ assess, policy, duplicates, persist, connect,
  identity, schemaSupports, publish, feedback, readback, emit = () => {} }) {
  let offered = false, declined = false, pending, complete;
  const event = name => { try { emit(Object.freeze({ event: name })); } catch { /* telemetry cannot fail work */ } };
  const blocked = p => p.noUse || p.noExternalWrite || p.optOut || p.contribute === 'off';
  async function candidate() {
    const p = await policy();
    if (blocked(p) || declined) return { status: 'OPTED_OUT' };
    const a = await assess();
    if (!a.observed || !a.reusable || !CLASSES.has(a.sourceClass))
      return { status: 'NO_REUSABLE_LEARNING' };
    if (a.safe !== true) { event('sanitization_blocked'); return { status: 'UNSAFE' }; }
    let lesson;
    try { lesson = distilled(a.lesson); }
    catch { event('sanitization_blocked'); return { status: 'UNSAFE' }; }
    const d = await duplicates(lesson);
    if (!d.unfilteredSearch || !d.inspectedCandidates) return { status: 'DUPLICATES_UNVERIFIED' };
    const rawUse = a.actualUse;
    if (rawUse && (!rawUse.searched || !rawUse.inspected || !rawUse.attempted || !OUTCOMES.has(rawUse.outcome)
        || typeof rawUse.memoryId !== 'string' || !/^mem_[a-zA-Z0-9_-]+$/.test(rawUse.memoryId)
        || typeof rawUse.reason !== 'string' || rawUse.reason.length < 20
        || rawUse.reason.length > 1000 || SENSITIVE.test(rawUse.reason)
        || !['public', 'private'].includes(rawUse.evidenceAudience)))
      return { status: 'ACTUAL_USE_UNVERIFIED' };
    const used = rawUse ? { memoryId: rawUse.memoryId, outcome: rawUse.outcome,
      actualAttempt: true, reason: rawUse.reason, evidenceAudience: rawUse.evidenceAudience } : undefined;
    if (used && (p.feedbackOptOut || p.feedback === 'off')) return { status: 'OPTED_OUT' };
    if (!used && d.equivalent) { event('duplicate_detected'); return { status: 'DUPLICATE' }; }
    return { status: 'ELIGIBLE', kind: used ? 'feedback' : 'memory', lesson, actualUse: used };
  }
  async function offer() {
    if (offered || complete || pending) return { status: 'ALREADY_HANDLED' };
    const c = await candidate();
    if (c.status !== 'ELIGIBLE') return c;
    offered = true;
    event('contribution_candidate_detected');
    event(c.kind === 'feedback' ? 'feedback_offer_shown' : 'contribution_offer_shown');
    return { status: 'OFFER', kind: c.kind, choices: ['preview', 'publish', 'not_now'] };
  }
  async function preview() {
    const c = await candidate();
    if (c.status !== 'ELIGIBLE') return c;
    event('contribution_previewed');
    return c; // Only distilled result and actual-use metadata, never source context.
  }
  function decline() {
    declined = true; pending = undefined;
    event('contribution_declined');
    return { status: 'DECLINED' };
  }
  async function approve({ visibility, idempotencyKey, payload, actualUse, kind }) {
    if (complete || pending) return { status: 'ALREADY_HANDLED' };
    if (!['private', 'public'].includes(visibility) || typeof idempotencyKey !== 'string'
        || !/^[a-zA-Z0-9:_-]{8,160}$/.test(idempotencyKey))
      return { status: 'INVALID_APPROVAL' };
    const c = await candidate();
    if (c.status !== 'ELIGIBLE') return c;
    // Approval is bound to the exact preview, action, observation and audience.
    if (JSON.stringify(c.lesson) !== JSON.stringify(payload) || c.kind !== kind
        || JSON.stringify(c.actualUse) !== JSON.stringify(actualUse))
      return { status: 'PREVIEW_CHANGED' };
    const p = await policy();
    if (visibility === 'public' && p.allowPublic !== true) return { status: 'VISIBILITY_REQUIRED' };
    if (c.actualUse && visibility !== c.actualUse.evidenceAudience) return { status: 'VISIBILITY_REQUIRED' };
    const request = { kind: c.kind, lesson: c.lesson, visibility, idempotencyKey,
      ...(c.actualUse ? { actualUse: c.actualUse } : {}) };
    pending = JSON.parse(JSON.stringify(request));
    await persist(pending); // Host private storage; before OAuth or any mutation.
    event('contribution_accepted');
    return { status: 'APPROVED' };
  }
  async function resume() {
    if (complete) return complete;
    if (!pending) return { status: 'NO_PENDING_ACTION' };
    const p = await policy();
    if (blocked(p) || declined || (pending.kind === 'feedback' && (p.feedbackOptOut || p.feedback === 'off')))
      return { status: 'OPTED_OUT' };
    if (pending.visibility === 'public' && p.allowPublic !== true) return { status: 'VISIBILITY_REQUIRED' };
    let who = await identity();
    if (!who.authenticated) { await connect(); who = await identity(); }
    if (!who.authenticated) return { status: 'AUTH_REQUIRED' };
    if (!who.id || (pending.agentId && who.id !== pending.agentId)) return { status: 'IDENTITY_CHANGED' };
    const scope = pending.kind === 'feedback' ? 'memory:feedback' : 'memory:write';
    if (!who.scopes?.includes(scope)) return { status: 'SCOPE_REQUIRED' };
    if (!await schemaSupports(pending.kind)) return { status: 'TOOL_SCHEMA_UNAVAILABLE' };
    if (!pending.attempted) {
      const c = await candidate(); // Policy, safety and duplicate recheck after OAuth.
      if (c.status !== 'ELIGIBLE') return c;
      if (JSON.stringify(c.lesson) !== JSON.stringify(pending.lesson) || c.kind !== pending.kind
          || JSON.stringify(c.actualUse) !== JSON.stringify(pending.actualUse))
        return { status: 'PREVIEW_CHANGED' };
      pending.agentId = who.id;
      pending.attempted = true;
      await persist(pending);
    }
    // Retain exact request on an ambiguous result. No new key, task rerun or duplicate bypass.
    const request = JSON.parse(JSON.stringify(pending));
    try {
      const acknowledgement = await (pending.kind === 'feedback' ? feedback(request) : publish(request));
      const verified = await readback(request, acknowledgement);
      if (verified?.verified !== true || typeof verified.id !== 'string') return { status: 'READBACK_UNCONFIRMED' };
      complete = { status: pending.kind === 'feedback' ? 'FEEDBACK_RECORDED' : 'PUBLISHED', id: verified.id };
      event(pending.kind === 'feedback' ? 'feedback_submitted' : 'contribution_published');
      return complete;
    } catch { return { status: 'WRITE_OR_READBACK_UNCONFIRMED' }; }
  }
  return { offer, preview, approve, resume, decline };
}

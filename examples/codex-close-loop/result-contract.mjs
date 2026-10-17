// Shared by the receipt mapper and its exhaustive contract tests.
// Snapshot of src/close-loop.ts CloseLoopResult at backend commit
// 5b40e1fcf9ba818cb95d347b26db510595e4a825. Verify drift with
// REMNANT_CLOSE_LOOP_SOURCE=/path/to/backend/src/close-loop.ts npm run test:close-loop.
export const CLOSE_LOOP_RESULT_CONTRACT = Object.freeze({
  PENDING: 'pending',
  NO_REUSABLE_LEARNING: 'complete',
  DUPLICATE: 'complete',
  UNSAFE: 'blocked',
  OPTED_OUT: 'blocked',
  REMNANT_DISABLED: 'blocked',
  WRITE_UNAVAILABLE: 'blocked',
  READ_UNAVAILABLE: 'blocked',
  CONSENT_REQUIRED: 'blocked',
  PUBLIC_NOT_ALLOWED: 'blocked',
  FEEDBACK_NOT_ALLOWED: 'blocked',
  FEEDBACK_AUTHORIZATION_UNVERIFIED: 'blocked',
  PUBLISHED: 'complete',
  FAILED: 'pending',
  UNCONFIRMED_WRITE: 'pending',
});
// Existing receipt-only blockers remain readable by current hosts.
export const LEGACY_RECEIPT_BLOCKERS = Object.freeze(['FEEDBACK_SCOPE_MISSING', 'TOOL_SCHEMA_UNAVAILABLE']);

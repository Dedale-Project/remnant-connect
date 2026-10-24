// Explicit profiles; selecting one never redirects or upgrades another connection.
export const READ_PROFILES = Object.freeze({
  'full-v1': Object.freeze({ endpoint: 'https://remnant.dedale-bi.com/mcp/chatgpt', outputContract: 'remnant-public-read-v1', resourcesRequired: false }),
  'minimal-v2': Object.freeze({ endpoint: 'https://remnant.dedale-bi.com/mcp/read/v2', outputContract: 'remnant-public-read-v2', projection: 'remnant-read-minimal-v1', resourcesRequired: true }),
});
export function readProfile(value = 'full-v1') {
  if (!Object.hasOwn(READ_PROFILES, value)) throw new Error('REMNANT_READ_PROFILE must be full-v1 or minimal-v2.');
  return READ_PROFILES[value];
}
/** SUPPORTED means demonstrated by the caller; a host name or discovery is not evidence. */
export function chooseReadProfile(resourcesRead = 'UNKNOWN', minimalAvailable = false) {
  if (!['SUPPORTED', 'UNSUPPORTED', 'UNKNOWN'].includes(resourcesRead)) throw new Error('Invalid resource capability assessment');
  return resourcesRead === 'SUPPORTED' && minimalAvailable ? 'minimal-v2' : 'full-v1';
}
export const READ_V2_RESOURCE_TEMPLATES = Object.freeze([
  'remnant://read-v2/memory/{id}/evidence{?limit,offset}',
  'remnant://read-v2/agent/{id}/evidence',
  'remnant://read-v2/agent/{id}/signed/{snapshotId}',
]);
export function isReadV2Resource(uri) {
  if (typeof uri !== 'string' || uri.length > 512) return false;
  const match = /^remnant:\/\/read-v2\/(?:memory\/mem_[A-Za-z0-9_-]{1,196}\/evidence|agent\/agt_[A-Za-z0-9_-]{1,196}\/(?:evidence|signed\/ps_[a-f0-9]{32}))(?:\?([^#]*))?$/.exec(uri);
  if (!match) return false;
  if (!uri.startsWith('remnant://read-v2/memory/') && match[1] !== undefined) return false;
  const entries = [...new URLSearchParams(match[1] ?? '')];
  return new Set(entries.map(([key]) => key)).size === entries.length &&
    entries.every(([key, value]) => /^(0|[1-9]\d*)$/.test(value) &&
      (key === 'limit' ? Number(value) >= 1 && Number(value) <= 50 : key === 'offset' && Number(value) <= 1000));
}

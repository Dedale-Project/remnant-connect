import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const bytes = name => readFileSync(new URL(name, root));
const text = name => bytes(name).toString('utf8');
const json = name => JSON.parse(text(name));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonicalRead = 'https://remnant.dedale-bi.com/mcp/chatgpt';

const pkg = json('package.json');
const lock = json('package-lock.json');
assert.equal(pkg.name, 'remnant-public-examples');
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(lock.name, pkg.name);
assert.equal(lock.version, pkg.version);
assert.equal(lock.packages[''].name, pkg.name);
assert.equal(lock.packages[''].version, pkg.version);
assert.equal(pkg.private, true, 'Prevent accidental npm publication.');
assert.equal(pkg.license, 'Apache-2.0');
assert.equal(lock.packages[''].license, pkg.license);
assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
assert.deepEqual(lock.packages[''].engines, pkg.engines);
assert.equal(pkg.repository.url, 'https://github.com/Dedale-Project/remnant-connect.git');
for (const [script, command] of Object.entries({
  start: 'node src/read-bridge.mjs',
  'test:bridge': 'node --test test/read-bridge.test.mjs',
  'validate:distribution': 'node scripts/validate-distribution.mjs',
  'validate:plugin': 'node scripts/validate-codex-plugin.mjs',
  'build:plugin': 'node scripts/build-plugin.mjs',
})) assert.equal(pkg.scripts[script], command, `Missing distribution entry point: ${script}`);
for (const name of ['src/read-bridge.mjs', 'test/read-bridge.test.mjs', 'docs/STDIO_READ.md'])
  assert.ok(existsSync(new URL(name, root)), `Missing bridge distribution file: ${name}`);

// Exact official Apache text; the owner/scope notice lives outside the license.
assert.equal(sha256(bytes('LICENSE')), 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  'LICENSE must match https://www.apache.org/licenses/LICENSE-2.0.txt exactly.');
const guidance = text('LICENSE_GUIDANCE.md');
assert.match(guidance, /Copyright 2026 DÉDALE \(Dedale-Project\)/);
for (const boundary of ['private Remnant backend', 'hosted service', 'databases', 'credentials', 'knowledge or memories', 'Third-party'])
  assert.ok(guidance.includes(boundary), `Missing license boundary: ${boundary}`);
assert.doesNotMatch(text('README.md') + guidance, /No open-source license is granted|owner has not selected an open-source license/);

// Snapshot retrieved from the official URL on 2026-10-10. Validate offline so
// a Glama outage or unrelated schema change cannot break an otherwise good build.
const schemaBytes = bytes('schemas/glama-server.schema.json');
assert.equal(sha256(schemaBytes), '7f652273293b658bcf9156646745c3aa9c42edcbd179ee126361e462814f1508',
  'Review and update the pinned Glama schema/hash/constraints together.');
const schema = JSON.parse(schemaBytes.toString('utf8'));
assert.equal(schema.$id, 'https://glama.ai/mcp/schemas/server.json');
assert.equal(schema.$schema, 'http://json-schema.org/draft-07/schema#');
assert.equal(schema.type, 'object');
assert.deepEqual(schema.required, ['maintainers']);
assert.deepEqual(Object.keys(schema.properties), ['maintainers']);
assert.equal(schema.properties.maintainers.type, 'array');
assert.equal(schema.properties.maintainers.items.type, 'string');
assert.equal(schema.properties.maintainers.uniqueItems, true);
const glama = json('glama.json');
assert.ok(glama !== null && typeof glama === 'object' && !Array.isArray(glama));
assert.ok(Object.hasOwn(glama, 'maintainers'));
assert.ok(Array.isArray(glama.maintainers));
assert.ok(glama.maintainers.every(name => typeof name === 'string'));
assert.equal(new Set(glama.maintainers).size, glama.maintainers.length);
// Project contract beyond the schema: only supported/documented fields and the
// verified maintainer account. Do not invent endpoint or release schema fields.
assert.deepEqual(Object.keys(glama).sort(), ['$schema', 'maintainers']);
assert.equal(glama.$schema, schema.$id);
assert.deepEqual(glama.maintainers, ['Dedale-Project']);

const plugin = json('plugins/remnant/plugin.json');
const compat = json('plugins/remnant/.codex-plugin/plugin.json');
assert.equal(plugin.version, compat.version);
assert.match(text('plugins/remnant/README.md'), new RegExp(`^# Remnant plugin ${plugin.version.replaceAll('.', '\\.')}\\r?\\n`));
assert.equal(json('plugins/remnant/mcp.json').mcpServers.remnant.url, canonicalRead);
assert.equal(json('plugins/remnant/.mcp.json').mcpServers.remnant.url, canonicalRead);
assert.equal(json('docs/server.registry.json').remotes[0].url, canonicalRead);
for (const name of ['LICENSE', 'LICENSE_GUIDANCE.md'])
  assert.deepEqual(bytes(`plugins/remnant/${name}`), bytes(name), `Portable license copy must match ${name}.`);
assert.ok(text('CHANGELOG.md').includes(`## ${pkg.version} —`), 'Current integration changelog missing.');
assert.ok(text('CHANGELOG.md').includes(`## Plugin ${plugin.version} —`), 'Current plugin changelog missing.');
assert.ok(text('releases/README.md').includes(`## ${plugin.version} —`), 'Current plugin release index missing.');
const archiveName = `remnant-plugin-${plugin.version}.zip`;
assert.ok(existsSync(new URL(`releases/${archiveName}`, root)), 'Current portable archive missing.');
for (const file of readdirSync(new URL('releases/', root)).filter(name => name.endsWith('.zip'))) {
  const checksum = text(`releases/${file.replace(/\.zip$/, '.sha256')}`).trim();
  assert.equal(checksum, `${sha256(bytes(`releases/${file}`))}  ${file}`, `Checksum mismatch: ${file}`);
}
// Pre-Apache artifacts retain their published bytes; do not rewrite history.
for (const [version, checksum] of Object.entries({
  '0.1.5': 'ad2591262abfb675246ec5663247f42a72d1b835b7cce21c766ce6f133095788',
  '0.1.6': '8a3e4c4db40ae1b595bcc6e7c939dc03e83b491c0b7e3d0cded6e47c4564ed49',
  '0.1.7': '8cff18f421b7e3be591d43a9ad9e00a6412fe29762b433ec3593a843d14958c2',
})) assert.equal(sha256(bytes(`releases/remnant-plugin-${version}.zip`)), checksum, `Historical ${version} archive changed.`);

console.log(`PASS: integration ${pkg.version}, plugin ${plugin.version}, Apache scope, pinned Glama schema, canonical endpoint and immutable archive checksums.`);

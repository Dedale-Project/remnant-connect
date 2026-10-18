import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const path = relative => new URL(relative, root);
const plugin = JSON.parse(readFileSync(path('plugins/remnant/plugin.json'), 'utf8'));
const compat = JSON.parse(readFileSync(path('plugins/remnant/.codex-plugin/plugin.json'), 'utf8'));
assert.match(plugin.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.equal(plugin.version, compat.version, 'Bump both plugin manifests together.');

// Keep legal files usable when the portable archive is distributed by itself.
for (const name of ['LICENSE', 'LICENSE_GUIDANCE.md']) {
  const bytes = readFileSync(path(name));
  assert.ok(!bytes.includes(Buffer.from('\r\n')), `${name} must use the committed LF line endings.`);
  writeFileSync(path(`plugins/remnant/${name}`), bytes);
}

function listFiles(relative = '') {
  return readdirSync(path(`plugins/remnant/${relative}`), { withFileTypes: true }).flatMap(entry => {
    assert.ok(!entry.isSymbolicLink(), 'Portable package must not contain symlinks.');
    const name = relative + entry.name;
    if (entry.isDirectory()) return listFiles(name + '/');
    assert.ok(entry.isFile(), `Unsupported package entry: ${name}`);
    assert.ok(!name.startsWith('/') && !name.includes('..') && !name.includes('\\'), `Unsafe package path: ${name}`);
    assert.ok(!/\.(?:mjs|cjs|js|ts|py|sh|ps1|exe|db|sqlite|pem|key)$/i.test(name), `Disallowed portable file: ${name}`);
    return [name];
  });
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

// ZIP STORE, fixed 1980-01-01 timestamps, stable sort and permissions: no runtime
// compressor or platform metadata can change the output. No ZIP64 is needed.
const files = listFiles().sort();
assert.ok(files.length < 0xffff, 'Too many ZIP entries.');
const localParts = [], centralParts = [];
let offset = 0;
for (const file of files) {
  const name = Buffer.from(file, 'utf8');
  const bytes = readFileSync(path(`plugins/remnant/${file}`));
  assert.ok(bytes.length < 0xffffffff && name.length < 0xffff);
  const crc = crc32(bytes);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 file names
  local.writeUInt16LE(0x0021, 12); // DOS date, 1980-01-01
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(bytes.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, bytes);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(0x0314, 4); // Unix, ZIP 2.0
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(0x0021, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(bytes.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + bytes.length;
  assert.ok(offset < 0xffffffff, 'Archive would require ZIP64.');
}
const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...localParts, centralDirectory, end]);
const archiveName = `remnant-plugin-${plugin.version}.zip`;
const checksum = `${createHash('sha256').update(archive).digest('hex')}  ${archiveName}\n`;
mkdirSync(path('releases/'), { recursive: true });
for (const [name, bytes] of [[archiveName, archive], [archiveName.replace(/\.zip$/, '.sha256'), Buffer.from(checksum)]]) {
  const output = path(`releases/${name}`);
  if (existsSync(output)) {
    assert.deepEqual(readFileSync(output), bytes,
      `Refusing to change ${name}. Bump the plugin version instead of replacing a release.`);
  } else {
    writeFileSync(output, bytes);
  }
}
console.log(`PASS: ${archiveName}, ${files.length} files, reproducible bytes; existing releases preserved.`);

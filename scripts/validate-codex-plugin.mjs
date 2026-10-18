import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const marketplace=read('.agents/plugins/marketplace.json'),root='plugins/remnant/';
const manifest=read(root+'plugin.json'),compat=read(root+'.codex-plugin/plugin.json');
assert.equal(marketplace.name,'remnant');assert.equal(marketplace.plugins.length,1);
assert.equal(marketplace.plugins[0].source.path,'./plugins/remnant');
assert.equal(manifest.name,marketplace.plugins[0].name);assert.equal(compat.version,manifest.version);
assert.deepEqual(compat.interface,manifest.extensions['com.openai'].interface);
const portable=read(root+'mcp.json'),legacy=read(root+'.mcp.json');
assert.deepEqual(Object.keys(portable.mcpServers),['remnant']);
assert.deepEqual(portable.mcpServers.remnant,{type:'streamable-http',url:'https://remnant.dedale-bi.com/mcp/chatgpt'});
assert.deepEqual(legacy,{mcpServers:{remnant:{url:portable.mcpServers.remnant.url}}});
for(const field of ['websiteURL','supportURL','privacyPolicyURL','termsOfServiceURL']) {
 const url=new URL(compat.interface[field]);assert.equal(url.origin,'https://remnant.dedale-bi.com');
 assert.equal(url.username+url.password,'');
}
assert.ok(existsSync(new URL('../'+root+'skills/remnant-memory/SKILL.md',import.meta.url)));
const skill=readFileSync(new URL('../'+root+'skills/remnant-memory/SKILL.md',import.meta.url),'utf8');
assert.equal(skill,readFileSync(new URL('../skills/remnant-memory/SKILL.md',import.meta.url),'utf8'),
 'Standalone and installed work skills must carry the same policy.');
for(const rule of ['explicit consent', 'actualAttempt=true', 'automatic: true', 'allowPublic',
 'PENDING_REUSABLE_LEARNING', 'Do not upload uncertainty as private/candidate content.',
 'BEFORE sending the final task-completion response', 'TOOL_SCHEMA_UNAVAILABLE', 'FEEDBACK_SCOPE_MISSING'])
 assert.ok(skill.includes(rule),'Missing distributed policy rule: '+rule);
assert.match(skill.split('\n')[2], /Automatically close the loop after non-trivial technical work/);
assert.match(skill.slice(0,1800), /BEFORE sending the final task-completion response/);
assert.equal(compat.hooks,undefined,'The portable package must not install executable hooks.');
assert.equal(manifest.hooks,undefined);
for(const file of [root+'mcp.json',root+'.mcp.json',root+'plugin.json',root+'.codex-plugin/plugin.json'])
 assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'), /Bearer\s|-----BEGIN.*PRIVATE KEY|sk-[A-Za-z0-9]{20}/);
const archiveName=`remnant-plugin-${manifest.version}.zip`;
const archive=readFileSync(new URL('../releases/'+archiveName,import.meta.url));
const expectedChecksum=readFileSync(new URL('../releases/'+archiveName.replace('.zip','.sha256'),import.meta.url),'utf8').trim();
assert.equal(expectedChecksum,createHash('sha256').update(archive).digest('hex')+'  '+archiveName);
// Validate actual packaged bytes rather than trusting a checksum generated from a stale ZIP.
// Releases use ordinary single-disk ZIP, stored/deflated files, no encryption or ZIP64.
let eocd=-1;
for(let i=archive.length-22;i>=Math.max(0,archive.length-65557);i--)
 if(archive.readUInt32LE(i)===0x06054b50){eocd=i;break;}
assert.ok(eocd>=0,'ZIP end-of-directory missing');
assert.equal(archive.readUInt16LE(eocd+4),0);assert.equal(archive.readUInt16LE(eocd+6),0);
const count=archive.readUInt16LE(eocd+10),entries=new Map();
let cursor=archive.readUInt32LE(eocd+16);
for(let i=0;i<count;i++){
 assert.equal(archive.readUInt32LE(cursor),0x02014b50);
 const flags=archive.readUInt16LE(cursor+8),method=archive.readUInt16LE(cursor+10);
 const size=archive.readUInt32LE(cursor+20),uncompressed=archive.readUInt32LE(cursor+24);
 const nameLength=archive.readUInt16LE(cursor+28),extra=archive.readUInt16LE(cursor+30),comment=archive.readUInt16LE(cursor+32);
 const name=archive.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
 const local=archive.readUInt32LE(cursor+42);cursor+=46+nameLength+extra+comment;
 assert.equal(flags&1,0,'Encrypted package entry');
 assert.ok(!name.startsWith('/')&&!name.includes('..')&&!name.includes('\\'),'Unsafe package path');
 if(name.endsWith('/'))continue;
 assert.ok(!entries.has(name),'Duplicate package entry');assert.equal(archive.readUInt32LE(local),0x04034b50);
 const start=local+30+archive.readUInt16LE(local+26)+archive.readUInt16LE(local+28);
 const compressed=archive.subarray(start,start+size);assert.ok(method===0||method===8,'Unsupported ZIP method');
 const content=method===0?compressed:inflateRawSync(compressed);assert.equal(content.length,uncompressed);
 entries.set(name,content);
}
function files(path=''){
 return readdirSync(new URL('../'+root+path,import.meta.url),{withFileTypes:true}).flatMap(entry=>
  entry.isDirectory()?files(path+entry.name+'/'):[path+entry.name]);
}
const expectedFiles=files().sort();assert.deepEqual([...entries.keys()].sort(),expectedFiles);
for(const name of expectedFiles){
 assert.ok(!/\.(?:mjs|cjs|js|ts|py|sh|ps1|exe)$/i.test(name),'Executable code cannot enter the portable archive');
 assert.deepEqual(entries.get(name),readFileSync(new URL('../'+root+name,import.meta.url)),name);
}
const instruction=readFileSync(new URL('../docs/agent-work-instruction.txt',import.meta.url),'utf8');
assert.match(instruction.slice(0,512),/BEFORE sending the final task-completion response/);
assert.equal(instruction,readFileSync(new URL('../examples/codex-close-loop/instructions.txt',import.meta.url),'utf8'));
console.log('PASS: anonymous endpoint, portable/CLI parity, early completion rule, exact release archive and isolated local hook example.');

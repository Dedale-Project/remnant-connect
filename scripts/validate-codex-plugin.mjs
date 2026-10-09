import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
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
 'PENDING_REUSABLE_LEARNING', 'Do not upload uncertainty as private/candidate content.'])
 assert.ok(skill.includes(rule),'Missing distributed policy rule: '+rule);
for(const file of [root+'mcp.json',root+'.mcp.json',root+'plugin.json',root+'.codex-plugin/plugin.json'])
 assert.doesNotMatch(readFileSync(new URL('../'+file,import.meta.url),'utf8'), /Bearer\s|-----BEGIN.*PRIVATE KEY|sk-[A-Za-z0-9]{20}/);
console.log('PASS: anonymous endpoint, portable/CLI parity, install source, metadata and bundled skill.');

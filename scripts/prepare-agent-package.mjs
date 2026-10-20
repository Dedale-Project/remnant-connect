import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
const base = new URL('../plugins/remnant-agent/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('plugin.json', base)));
mkdirSync(new URL('.codex-plugin/', base), {recursive:true});
writeFileSync(new URL('.codex-plugin/plugin.json', base), JSON.stringify({
  name:manifest.name, version:manifest.version, description:manifest.description,
  author:manifest.author, interface:manifest.extensions['com.openai'].interface,
  skills:'./skills'
},null,2)+'\n');
mkdirSync(new URL('assets/', base), {recursive:true});
for(const name of ['icon-128.png','logo-512.png'])
  copyFileSync(new URL('../remnant/assets/'+name,base),new URL('assets/'+name,base));

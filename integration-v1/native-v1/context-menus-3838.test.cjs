// Historical source execution probes were removed: inspected app code is data.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const registry=require('./native-menu-profiles.json');
test('3838 action-state layout stays supported independently of minified source bytes',()=>{
 const p=registry.profiles.find(p=>p.layout==='codex-2228');assert.ok(p.actionState);assert.equal(p.cacheLength,98);assert.equal(p.nativeIndex,13);assert.equal(p.closeIndex,51);
});
test('menu verification neither hashes nor executes inspected function source',()=>{
 const source=fs.readFileSync(__dirname+'/context-menus.js','utf8');
 assert.doesNotMatch(source,/crypto|subtle\.digest|functionSha256|functionLength|\beval\s*\(|new Function/);
 assert.match(source,/sourceMatches/);assert.match(source,/Object\.getOwnPropertyDescriptor/);
});

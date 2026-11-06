const {test}=require('node:test'),assert=require('node:assert/strict');
const registry=require('./native-menu-profiles.json');
const {reviewedNativeMenus}=require('./menu-profile-validation.cjs');
test('builder accepts the exact legacy and reviewed new menu fingerprints',()=>{const profiles=reviewedNativeMenus(registry);assert.deepEqual(profiles.map(profile=>profile.functionName),['Wxn','x','t']);assert.notEqual(profiles,registry.profiles);});
test('builder rejects unknown fingerprints, fields and versions',()=>{for(const update of [{functionSha256:'0'.repeat(64)},{functionLength:13442},{appVersion:'26.0.0.0'},{layout:'unreviewed'},{unreviewed:true}]){const clone=JSON.parse(JSON.stringify(registry));Object.assign(clone.profiles[1],update);assert.throws(()=>reviewedNativeMenus(clone));}});
test('builder rejects missing, excessive and duplicate profile registries',()=>{for(const value of [{schema:2,profiles:registry.profiles},{schema:1,profiles:[]},{schema:1,profiles:[registry.profiles[0],registry.profiles[0]]},{schema:1,profiles:[...registry.profiles,registry.profiles[1]]}])assert.throws(()=>reviewedNativeMenus(value));});

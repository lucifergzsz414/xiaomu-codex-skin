const {test}=require('node:test'),assert=require('node:assert/strict');
const registry=require('./native-menu-profiles.json');
const {reviewedNativeMenus}=require('./menu-profile-validation.cjs');
test('builder accepts the exact legacy and reviewed new menu fingerprints',()=>{const profiles=reviewedNativeMenus(registry);assert.deepEqual(profiles.map(profile=>[profile.functionName,profile.functionLength]),[['Wxn',12391],['x',13441],['t',13422],['t',13645]]);assert.notEqual(profiles,registry.profiles);});

test('builder rejects modified or missing 6628 fingerprint without weakening legacy checks',()=>{
 for(const update of [{functionSha256:'0'.repeat(64)},{functionLength:13644},{appVersion:'26.1106.6629.0'},{layout:'codex-6628'}]){
  const clone=JSON.parse(JSON.stringify(registry));Object.assign(clone.profiles[3],update);assert.throws(()=>reviewedNativeMenus(clone));
 }
 assert.throws(()=>reviewedNativeMenus({...registry,profiles:registry.profiles.slice(0,3)}));
});
test('builder rejects unknown fingerprints, fields and versions',()=>{for(const update of [{functionSha256:'0'.repeat(64)},{functionLength:13442},{appVersion:'26.0.0.0'},{layout:'unreviewed'},{unreviewed:true}]){const clone=JSON.parse(JSON.stringify(registry));Object.assign(clone.profiles[1],update);assert.throws(()=>reviewedNativeMenus(clone));}});
test('builder rejects missing, excessive and duplicate profile registries',()=>{for(const value of [{schema:2,profiles:registry.profiles},{schema:1,profiles:[]},{schema:1,profiles:[registry.profiles[0],registry.profiles[0]]},{schema:1,profiles:[...registry.profiles,registry.profiles[1]]}])assert.throws(()=>reviewedNativeMenus(value));});

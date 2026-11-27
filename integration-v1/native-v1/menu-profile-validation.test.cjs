const {test}=require('node:test'),assert=require('node:assert/strict');
const registry=require('./native-menu-profiles.json');
const {reviewedNativeMenus}=require('./menu-profile-validation.cjs');
test('builder accepts structural layouts without byte fingerprints or version caps',()=>{
 const rows=reviewedNativeMenus(registry);assert.deepEqual(rows,registry.profiles);assert.notEqual(rows,registry.profiles);
 const many={schema:2,profiles:Array.from({length:12},(_,i)=>({...rows[1],layout:'compatible-'+i}))};
 assert.equal(reviewedNativeMenus(many).length,12);
});
test('builder rejects invalid cache indices and missing layouts',()=>{
 for(const profile of [null,{}, {...registry.profiles[1],nativeIndex:-1},{...registry.profiles[1],closeIndex:98},{...registry.profiles[4],openIndex:null}])assert.throws(()=>reviewedNativeMenus({schema:2,profiles:[profile]}));
 for(const value of [{schema:1,profiles:registry.profiles},{schema:2,profiles:[]},{schema:2,profiles:[registry.profiles[0],registry.profiles[0]]}])assert.throws(()=>reviewedNativeMenus(value));
});

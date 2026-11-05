const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {eligible:source}=require('./engine.cjs');
function check({profile=0,art=false,root=0,list=false,sidebar=0,main=false}={}){return !!vm.runInNewContext(source,{window:{},document:{querySelectorAll:s=>({length:s.includes('left-panel')?sidebar:s.includes('profile-identity')?profile:root}),querySelector:s=>s.startsWith('main:')?main:s.includes('character-artwork')?art:list}});}
test('standalone native Dot is eligible without main or sidebar',()=>assert.equal(check({profile:1,art:true,root:1,list:true}),true));
test('partial and ambiguous native markers are rejected',()=>{for(const args of [{profile:1},{root:1,list:true},{profile:1,art:true,root:2,list:true},{profile:2,art:true,root:1,list:true}])assert.equal(check(args),false);});
test('ordinary native shell remains eligible',()=>assert.equal(check({sidebar:1,main:true}),true));

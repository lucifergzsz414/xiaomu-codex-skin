// Read-only assertions against installed bytes. Never evaluate application code.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const archive=process.env.XIAOMU_CODEX_6357_ASAR||'C:/Program Files/WindowsApps/OpenAI.Codex_26.1120.6357.0_x64__2p2nqsd0c76g0/app/resources/app.asar';
function readAsset(file){
 const fd=fs.openSync(archive,'r');
 try{
  const size=fs.fstatSync(fd).size,prefix=Buffer.alloc(16);assert.equal(fs.readSync(fd,prefix,0,16,0),16);assert.equal(prefix.readUInt32LE(0),4);
  const headerSize=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12),base=8+headerSize;
  assert.ok(headerSize<=16*1024*1024&&jsonSize<=headerSize-8&&base<=size);
  const bytes=Buffer.alloc(jsonSize);assert.equal(fs.readSync(fd,bytes,0,bytes.length,16),bytes.length);
  const entry=file.split('/').reduce((node,key)=>node.files[key],JSON.parse(bytes));
  assert.ok(!entry.unpacked&&!entry.link&&Number.isSafeInteger(entry.size)&&entry.size<24*1024*1024&&/^\d+$/.test(entry.offset));
  const at=base+Number(entry.offset);assert.ok(Number.isSafeInteger(at)&&at+entry.size<=size);
  const content=Buffer.alloc(entry.size);assert.equal(fs.readSync(fd,content,0,content.length,at),content.length);return content.toString('utf8');
 }finally{fs.closeSync(fd);}
}
test('installed 6357 retains the 171-slot Radix component and action-state hooks',{skip:!fs.existsSync(archive)},()=>{
 const source=readAsset('webview/assets/async/366996.9782070574.js');
 const at=source.indexOf('t:function(e){let t,n,y,D,b,L,P,w,M,U,k,F,j,G,X,V,B,H,W,Y,$,K,z,Z='),end=source.indexOf('uuN8:',at);assert.ok(at>0&&end>at);
 const menu=source.slice(at,end);
 for(const token of ['(0,r.c)(171)','disableNative:et','children:J','getItems:Q','showContextMenu','Z[2]=t','Z[56]=X','l.useLayoutEffect(n,y)','l.useRef(null)','[eP,ew]=l.useState(null)','eM=l.useRef(void 0)','onOpenChange:eW'])assert.ok(menu.includes(token),token);
 assert.equal((menu.match(/\buseState\)?\s*\(/g)||[]).length,3);
 assert.ok(source.includes('data-radix-menu-content'));
});
test('installed 6357 native HTML popover uses original opener and stable DOM anchors',{skip:!fs.existsSync(archive)},()=>{
 const source=readAsset('webview/assets/async/820714.01ab4a97ce.js');
 const at=source.indexOf('function J(e)'),end=source.indexOf('function U(e)',at);assert.ok(at>=0&&end>at);
 const menu=source.slice(at,end);
 for(const token of ['(0,o.c)(80)','disableNative:R','trigger:z','openOnPointerDown:$','getItems:M','showContextMenu','S[29]=R','S[21]=h','S[12]=g','S[37]=w','[et,en]=(0,a.useState)(null)','er=(0,a.useRef)(null)','el=(0,a.useRef)(void 0)','useLayoutEffect','useEffect','"popover"','"system"'])assert.ok(menu.includes(token),token);
 assert.equal((menu.match(/\buseState\)?\s*\(/g)||[]).length,1);
 for(const token of ['"data-native-menu-root"','"data-native-menu-surface"','role:"menu"'])assert.ok(source.includes(token),token);
});

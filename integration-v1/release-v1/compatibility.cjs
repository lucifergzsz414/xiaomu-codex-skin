'use strict';
// Read installed code as data only. No imports/evaluation or archive extraction.
const fs=require('node:fs'),crypto=require('node:crypto');
function archiveFileTime(stat){return (stat.mtimeNs/100n+116444736000000000n).toString();}
function assessSources(sources,contract){
 if(contract.schema!==1||!Array.isArray(sources))throw Error('Invalid compatibility contract');
 const capabilities={};
 for(const [feature,groups] of Object.entries(contract.features))capabilities[feature]=groups.every(group=>group.some(token=>sources.some(s=>s.includes(token))));
 const needle='function '+contract.menu.name+'(';
 capabilities.contextMenus=capabilities.contextMenus&&sources.some(s=>{let index=s.indexOf(needle);while(index>=0){if(crypto.createHash('sha256').update(s.slice(index,index+contract.menu.length)).digest('hex')===contract.menu.sha256)return true;index=s.indexOf(needle,index+needle.length)}return false});
 const disabled=Object.keys(capabilities).filter(k=>!capabilities[k]);
 return {schema:1,core:capabilities.core,capabilities,disabled,mode:!capabilities.core?'unsupported':disabled.length?'degraded':'compatible'};
}
function inspectArchive(archive,contract){
 const fd=fs.openSync(archive,'r');
 try{
  const stat=fs.fstatSync(fd),exactStat=fs.fstatSync(fd,{bigint:true}),prefix=Buffer.alloc(16);
  if(BigInt(stat.size)!==exactStat.size)throw Error('Archive changed during inspection');
  if(fs.readSync(fd,prefix,0,16,0)!==16||prefix.readUInt32LE(0)!==4)throw Error('Invalid ASAR prefix');
  const headerSize=prefix.readUInt32LE(4),jsonSize=prefix.readUInt32LE(12),base=8+headerSize;
  if(headerSize<8||headerSize>16*1024*1024||prefix.readUInt32LE(8)!==headerSize-4||jsonSize>headerSize-8||base>stat.size)throw Error('Invalid ASAR bounds');
  const bytes=Buffer.alloc(jsonSize);if(fs.readSync(fd,bytes,0,jsonSize,16)!==jsonSize)throw Error('Truncated ASAR header');
  const header=JSON.parse(bytes.toString('utf8')),assets=[];let nodes=0,total=0;
  function walk(node,parts){
   if(parts.length>12||++nodes>100000)throw Error('ASAR complexity limit');
   for(const [name,entry] of Object.entries(node.files||{})){
    if(!entry||typeof entry!=='object'||!name||/[\\/]/.test(name)||name==='.'||name==='..')throw Error('Invalid ASAR entry');
    const next=[...parts,name];
    if(entry.files){walk(entry,next);continue}
    const file=next.join('/');
    if(!/^webview\/assets\/(?:(?:app-(?:initial|shared|primary)|recents|settings-page|command-menu-dialog)-[^/]+\.js|(?:codex-micro-bridge|app-initial|app-shared|index)-[^/]+\.css)$/.test(file))continue;
    if(entry.link||entry.unpacked||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>24*1024*1024||!/^\d+$/.test(entry.offset||''))throw Error('Uninspectable runtime asset');
    const offset=Number(entry.offset);total+=entry.size;
    if(!Number.isSafeInteger(offset)||base+offset+entry.size>stat.size||total>96*1024*1024||assets.length>=256)throw Error('ASAR asset limit');
    const content=Buffer.alloc(entry.size);if(fs.readSync(fd,content,0,content.length,base+offset)!==content.length)throw Error('Truncated asset');
    assets.push(content.toString('utf8'));
   }
  }
  const assetRoot=header.files?.webview?.files?.assets;
  if(!assetRoot?.files)throw Error('No supported runtime assets');
  walk(assetRoot,['webview','assets']);if(!assets.length)throw Error('No supported runtime assets');
  const result=assessSources(assets,contract),after=fs.fstatSync(fd,{bigint:true});
  if(exactStat.size!==after.size||exactStat.mtimeNs!==after.mtimeNs)throw Error('Archive changed during inspection');
  return {...result,archiveSize:stat.size,archiveMtimeUtc:stat.mtime.toISOString(),archiveMtimeFileTimeUtc:archiveFileTime(exactStat),assetsChecked:assets.length};
 }finally{fs.closeSync(fd)}
}
module.exports={assessSources,inspectArchive,archiveFileTime};
if(require.main===module){try{const contract=require('./compatibility-contract.json');console.log(JSON.stringify(inspectArchive(process.argv[2],contract)))}catch{console.error('Compatibility inspection failed; original Codex remains available.');process.exitCode=1}}

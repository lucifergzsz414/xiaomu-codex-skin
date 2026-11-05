'use strict';
// Read installed code as data only. No imports/evaluation or archive extraction.
const fs=require('node:fs'),crypto=require('node:crypto');
function archiveFileTime(stat){return (stat.mtimeNs/100n+116444736000000000n).toString();}
function assessSources(sources,contract){
 if(contract.schema!==1||!Array.isArray(sources))throw Error('Invalid compatibility contract');
 const capabilities={};
 for(const [feature,groups] of Object.entries(contract.features))capabilities[feature]=groups.every(group=>group.some(token=>sources.some(s=>s.includes(token))));
 const variants=contract.menu?.variants??[];if(!Array.isArray(variants)||variants.length>8)throw Error('Invalid menu variants');
 const menus=[contract.menu,...variants];
 for(const menu of menus)if(!menu||typeof menu.name!=='string'||! /^[A-Za-z_$][\w$]{0,99}$/.test(menu.name)||!Number.isSafeInteger(menu.length)||menu.length<1||menu.length>1000000||typeof menu.sha256!=='string'||! /^[a-f0-9]{64}$/i.test(menu.sha256))throw Error('Invalid menu fingerprint');
 capabilities.contextMenus=capabilities.contextMenus&&menus.some(menu=>sources.some(s=>{const needle='function '+menu.name+'(';let index=s.indexOf(needle);while(index>=0){if(crypto.createHash('sha256').update(s.slice(index,index+menu.length)).digest('hex')===menu.sha256.toLowerCase())return true;index=s.indexOf(needle,index+needle.length)}return false}));
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
  const header=JSON.parse(bytes.toString('utf8')),assets=[],entries=new Map(),seen=new Set(),digests=new Map();let nodes=0,total=0,reads=0;
  function read(file,entry,include=true){
   if(seen.has(file))return null;
   if(!entry||entry.files||entry.link||entry.unpacked||!Number.isSafeInteger(entry.size)||entry.size<0||entry.size>24*1024*1024||!/^\d+$/.test(entry.offset||''))throw Error('Uninspectable runtime asset');
   const offset=Number(entry.offset);
   if(!Number.isSafeInteger(offset)||base+offset+entry.size>stat.size||total+entry.size>96*1024*1024||reads>=256)throw Error('ASAR asset limit');
   const content=Buffer.alloc(entry.size);if(fs.readSync(fd,content,0,content.length,base+offset)!==content.length)throw Error('Truncated asset');
   const source=content.toString('utf8');seen.add(file);digests.set(file,crypto.createHash('sha256').update(content).digest('hex'));reads++;total+=entry.size;if(include)assets.push(source);return source;
  }
  function walk(node,parts){
   if(parts.length>12||++nodes>100000)throw Error('ASAR complexity limit');
   for(const [name,entry] of Object.entries(node.files||{})){
    if(!entry||typeof entry!=='object'||!name||/[\\/]/.test(name)||name==='.'||name==='..')throw Error('Invalid ASAR entry');
    const next=[...parts,name];
    if(entry.files){walk(entry,next);continue}
    entries.set(next.join('/'),entry);
   }
  }
  const assetRoot=header.files?.webview?.files?.assets;
  if(!assetRoot?.files)throw Error('No supported runtime assets');
  walk(assetRoot,['webview','assets']);
  const legacy=[...entries].filter(([file])=>/^webview\/assets\/(?:(?:app-(?:initial|shared|primary)|recents|settings-page|command-menu-dialog)-[^/]+\.js|(?:codex-micro-bridge|app-initial|app-shared|index)-[^/]+\.css)$/.test(file));
  if(legacy.length){for(const [file,entry]of legacy)read(file,entry);}
  else{
   // Rspack publishes numeric files. Discover only the HTML entry points and
   // two literal startup-import waves; never crawl every lazy application chunk.
   const html=read('webview/index.html',header.files?.webview?.files?.['index.html'],false);
   const roots=[];
   for(const tag of html.matchAll(/<script\b[^>]*>/gi)){
    const src=tag[0].match(/\bsrc\s*=\s*(["'])([^"']+)\1/i);if(!src)continue;
    if(!/^\/?assets\/(?:0|[1-9]\d*)\.[a-f0-9]{8,64}\.js$/.test(src[2]))throw Error('Unsupported runtime entry');
    const file='webview/'+src[2].replace(/^\//,'');if(!roots.includes(file))roots.push(file);
   }
   if(!roots.length)throw Error('No supported runtime assets');
   let wave=roots.map(file=>read(file,entries.get(file)));
   const loaders=[];
   for(const source of wave)for(const match of source.matchAll(/([A-Za-z_$][\w$]*)\.u=([A-Za-z_$][\w$]*)=>"assets\/async\/"\+\2\+"\."\+\(\{([^}]+)\}\)\[\2\]\+"\.js"/g))loaders.push({source,owner:match[1],body:match[3]});
   if(loaders.length!==1)throw Error('Unsupported runtime loader');
   const loader=loaders[0],escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   function numericMap(body){
    const text=body.replace(/\s/g,'');
    if(!/^(?:0|[1-9]\d*)(?:e\+?\d+)?:"[a-f0-9]{8,64}"(?:,(?:0|[1-9]\d*)(?:e\+?\d+)?:"[a-f0-9]{8,64}")*$/.test(text))throw Error('Unsupported runtime chunk map');
    const result=new Map();for(const pair of text.matchAll(/((?:0|[1-9]\d*)(?:e\+?\d+)?):"([a-f0-9]+)"/g)){
     const id=String(Number(pair[1]));if(!Number.isSafeInteger(Number(pair[1]))||result.has(id)||result.size>=100000)throw Error('Ambiguous runtime chunk map');
     result.set(id,pair[2]);
    }return result;
   }
   const jsMap=numericMap(loader.body);
   const cssPattern=new RegExp(escape(loader.owner)+'\\.miniCssF=([A-Za-z_$][\\w$]*)=>"assets/async/"\\+\\(\\{([^}]+)\\}\\)\\[\\1\\]\\+"\\.css"','g');
   const cssMatches=[...loader.source.matchAll(cssPattern)];if(cssMatches.length!==1)throw Error('Unsupported runtime CSS map');
   const cssMap=numericMap(cssMatches[0][2]);
   // This finite numeric-only regex is loader metadata, not JavaScript code.
   // No quantifiers, escapes, flags or executable expressions are accepted.
   const skipMatches=[...loader.source.matchAll(/else if\(\/\^([0-9()|]+)\$\/\.test\(([A-Za-z_$][\w$]*)\)\)([A-Za-z_$][\w$]*)\[\2\]=0;else/g)];
   if(skipMatches.length!==1||skipMatches[0][1].length>4096)throw Error('Unsupported runtime JS-skip declaration');
   const cssOnly=new RegExp('^'+skipMatches[0][1]+'$');
   const numericFiles=new Map();
   for(const [file,entry]of entries){
    const match=file.match(/^webview\/assets\/(?:async\/)?((?:0|[1-9]\d*))\.([a-f0-9]{8,64})\.js$/);if(!match)continue;
    const rows=numericFiles.get(match[1])||[];rows.push({file,entry,hash:match[2]});numericFiles.set(match[1],rows);
   }
   const cssReads=new Set();
   for(let depth=1;depth<=2;depth++){
    const ids=new Set(wave.flatMap(source=>[...source.matchAll(/\b[A-Za-z_$][\w$]*\.e\(((?:0|[1-9]\d*)(?:e\+?\d+)?)\)/g)].map(match=>String(Number(match[1])))));wave=[];
    if(depth===1&&!ids.size)throw Error('Unsupported runtime startup imports');
    for(const id of ids){
     if(!Number.isSafeInteger(Number(id)))throw Error('Invalid runtime chunk ID');
     const rows=numericFiles.get(id)||[];if(rows.length>1)throw Error('Ambiguous runtime chunk');
     if(rows.length===1){
      const row=rows[0];if(seen.has(row.file))continue;
      if(jsMap.get(id)!==row.hash||row.file!=='webview/assets/async/'+id+'.'+row.hash+'.js')throw Error('Mismatched runtime chunk');
      const source=read(row.file,row.entry);if(source!==null)wave.push(source);
     }else{
      if(jsMap.has(id)||!cssOnly.test(id)||!cssMap.has(id))throw Error('Missing runtime chunk');
      const file='webview/assets/async/'+cssMap.get(id)+'.css';if(!entries.has(file))throw Error('Missing runtime CSS chunk');cssReads.add(file);
     }
    }
   }
   for(const file of cssReads)read(file,entries.get(file));
  }
  if(!assets.length)throw Error('No supported runtime assets');
  // Reviewed lazy resources are admitted only by an already inspected bootstrap
  // fingerprint. They share the existing read quotas and never execute code.
  const profiles=contract.resourceProfiles??[];
  if(!Array.isArray(profiles)||profiles.length>4)throw Error('Invalid resource profiles');
  const safePath=value=>typeof value==='string'&&/^webview\/assets\/(?:async\/)?[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*\.(?:js|css)$/.test(value);
  const safeDigest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const profileIds=new Set();
  for(const profile of profiles){
   if(!profile||typeof profile.id!=='string'||! /^[A-Za-z0-9._-]{1,100}$/.test(profile.id)||profileIds.has(profile.id)||!safePath(profile.bootstrap?.path)||!safeDigest(profile.bootstrap?.sha256)||!Array.isArray(profile.assets)||profile.assets.length>64)throw Error('Invalid resource profile');
   profileIds.add(profile.id);const paths=new Set();
   for(const asset of profile.assets){
    if(!asset||!safePath(asset.path)||!safeDigest(asset.sha256)||typeof asset.feature!=='string'||!Object.hasOwn(contract.features,asset.feature)||paths.has(asset.path))throw Error('Invalid supplemental resource');
    paths.add(asset.path);
   }
   if(digests.get(profile.bootstrap.path)!==profile.bootstrap.sha256)continue;
   for(const asset of profile.assets){
    read(asset.path,entries.get(asset.path));
    if(digests.get(asset.path)!==asset.sha256)throw Error('Supplemental resource identity changed');
   }
  }
  const result=assessSources(assets,contract),after=fs.fstatSync(fd,{bigint:true});
  if(exactStat.size!==after.size||exactStat.mtimeNs!==after.mtimeNs)throw Error('Archive changed during inspection');
  return {...result,archiveSize:stat.size,archiveMtimeUtc:stat.mtime.toISOString(),archiveMtimeFileTimeUtc:archiveFileTime(exactStat),assetsChecked:assets.length};
 }finally{fs.closeSync(fd)}
}
module.exports={assessSources,inspectArchive,archiveFileTime};
if(require.main===module){try{const contract=require('./compatibility-contract.json');console.log(JSON.stringify(inspectArchive(process.argv[2],contract)))}catch{console.error('Compatibility inspection failed; original Codex remains available.');process.exitCode=1}}

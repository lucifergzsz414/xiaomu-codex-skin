'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const area=path.resolve(process.env.XIAOMU_TEST_ROOT||path.join(require('node:os').tmpdir(),'xiaomu-release-layout-tests'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const names=['maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js','launch.vbs','restore.vbs','engine.cjs','guardian-compat.cjs','caption-contrast.cjs','owner-check.exe','compatibility.cjs','compatibility-contract.json','manager-portrait.png','USAGE.md','xiaomu.ico','common-windows.ps1','config-utf8.ps1','LICENSE-upstream.txt'];

function fixture(){
 fs.mkdirSync(area,{recursive:true});
 const root=fs.mkdtempSync(path.join(area,'release-layout-'));
 const parent=path.join(root,'installed'),desktop=path.join(root,'Desktop'),programs=path.join(root,'Programs');
 fs.mkdirSync(desktop);fs.mkdirSync(programs);
 function packageFor(version,layout){
  const source=fs.mkdtempSync(path.join(root,'source-')),files={};
  for(const name of names){
   const bytes=['maintenance.ps1','entrypoints.ps1','install.ps1','control-actions.ps1'].includes(name)?fs.readFileSync(path.join(__dirname,name)):Buffer.from('fixture '+version+' '+name);
   fs.writeFileSync(path.join(source,name),bytes);files[name]=sha(bytes);
  }
  const manifest={id:'xiaomu-codex-skin',version,releaseLabel:version,releaseChannel:'stable',files};
  if(layout!==undefined)manifest.installationLayoutVersion=layout;
  fs.writeFileSync(path.join(source,'manifest.json'),JSON.stringify(manifest));
  return source;
 }
 function install(source,repair=false){
  const code=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & ${quote(path.join(__dirname,'install.ps1'))} -SourceRoot ${quote(source)} -InstallParent ${quote(parent)} -ShortcutDirectory ${quote(desktop)} -ManagementShortcutDirectory ${quote(programs)} ${repair?'-Repair':''}`;
  return JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{encoding:'utf8',stdio:'pipe',windowsHide:true,timeout:30000,maxBuffer:1024*1024}).trim());
 }
 function cleanup(){
  if(path.dirname(root)!==area||!path.basename(root).startsWith('release-layout-'))throw Error('Unexpected fixture directory');
  fs.rmSync(root,{recursive:true,force:true});
 }
 return {root,parent,desktop,programs,packageFor,install,cleanup};
}

test('legacy 1.0.0 packages still install with exactly two dedicated shortcuts',()=>{
 const f=fixture();try{
  const receipt=f.install(f.packageFor('1.0.0'));
  assert.equal(receipt.version,'1.0.0');assert.equal(receipt.filesVerified,24);
  assert.equal(receipt.destination,path.join(f.parent,'1.0.0'));
  assert.equal(fs.readdirSync(f.desktop).length,1);assert.equal(fs.readdirSync(f.programs).length,1);
  assert.equal(fs.existsSync(path.join(receipt.destination,'stop.flag')),false);
 }finally{f.cleanup();}
});

test('a later release upgrades the existing layout and preserves complete rollback and entrypoint records',()=>{
 const f=fixture();try{
  const original=f.install(f.packageFor('1.0.0')),target=original.destination;
  const oldManifest=fs.readFileSync(path.join(target,'manifest.json'));
  const state='{"fixture":"entrypoint recovery"}';
  fs.writeFileSync(path.join(target,'entrypoints.json'),state);
  fs.writeFileSync(path.join(target,'control-state.json'),'{"action":"Pause"}');
  const next=f.packageFor('1.0.1','1.0.0');
  const receipt=f.install(next,true);
  assert.equal(receipt.version,'1.0.1');assert.equal(receipt.installationLayoutVersion,'1.0.0');
  assert.equal(receipt.destination,target);assert.equal(fs.existsSync(path.join(f.parent,'1.0.1')),false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(target,'manifest.json'))).version,'1.0.1');
  assert.equal(fs.readFileSync(path.join(target,'entrypoints.json'),'utf8'),state);
  assert.equal(fs.readFileSync(path.join(target,'stop.flag'),'utf8'),'stop');
  assert.deepEqual(fs.readFileSync(path.join(receipt.repairBackup,'manifest.json')),oldManifest);
  assert.equal(fs.readdirSync(f.desktop).length,1);assert.equal(fs.readdirSync(f.programs).length,1);
  const repeat=f.install(next);assert.equal(repeat.version,'1.0.1');
  assert.equal(fs.readdirSync(f.parent).filter(name=>name.startsWith('backup-repair-')).length,1);
 }finally{f.cleanup();}
});

test('unsupported layouts and malformed product versions cannot mutate an installed release',()=>{
 const f=fixture();try{
  const {destination}=f.install(f.packageFor('1.0.0'));
  const original=fs.readFileSync(path.join(destination,'manifest.json'));
  for(const [version,layout] of [['1.0.1',undefined],['1.0.1','2.0.0'],['01.0.1','1.0.0'],['1.0.1-beta','1.0.0'],['2147483648.0.0','1.0.0']]){
   assert.throws(()=>f.install(f.packageFor(version,layout),true));
   assert.deepEqual(fs.readFileSync(path.join(destination,'manifest.json')),original);
  }
  assert.equal(fs.readdirSync(f.parent).some(name=>name.startsWith('backup-repair-')),false);
 }finally{f.cleanup();}
});

test('the bundled clean-environment checker accepts the same future product and existing layout',()=>{
 const f=fixture();try{
  const source=f.packageFor('1.0.1','1.0.0'),report=path.join(f.root,'report');
  const code=`$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & ${quote(path.join(__dirname,'clean-environment-check.ps1'))} -Phase ValidatePackage -SkinPackage ${quote(source)} -ReportDirectory ${quote(report)}`;
  const result=JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{encoding:'utf8',stdio:'pipe',windowsHide:true,timeout:30000}).trim());
  assert.equal(result.technicalChecksPassed,true);assert.equal(result.runtime,'not-checked');
  assert.equal(fs.existsSync(f.parent),false);assert.equal(fs.readdirSync(f.desktop).length,0);
 }finally{f.cleanup();}
});

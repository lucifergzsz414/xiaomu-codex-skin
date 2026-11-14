'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const manager=path.join(__dirname,'manager.ps1');
const area=path.resolve(process.env.XIAOMU_TEST_ROOT||path.join(require('node:os').tmpdir(),'xiaomu-pending-compatibility-tests'));
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const shells=[path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe')];
let ps7=path.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell/7/pwsh.exe');
if(!fs.existsSync(ps7))try{ps7=execFileSync('where.exe',['pwsh.exe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).find(value=>fs.existsSync(value))||ps7;}catch{}
if(fs.existsSync(ps7))shells.push(ps7);

function fixture({pending=true,mutate=()=>{}}={}){
 fs.mkdirSync(area,{recursive:true});
 const root=fs.mkdtempSync(path.join(area,'manager-pending-'));
 const oldBytes=Buffer.from(JSON.stringify({schema:1,features:{core:[['old-fixture-marker']]}}));
 const newBytes=Buffer.from(JSON.stringify({schema:1,features:{core:[['new-fixture-marker']]}}));
 const files={'compatibility-contract.json':sha(oldBytes)};
 fs.writeFileSync(path.join(root,'compatibility-contract.json'),oldBytes);
 for(let index=0;index<23;index++){
  const name='managed-'+index+'.txt',bytes=Buffer.from('fixture-'+index);
  fs.writeFileSync(path.join(root,name),bytes);files[name]=sha(bytes);
 }
 const manifest={id:'xiaomu-codex-skin',version:'1.0.0',files,fixtureMetadata:{preserved:true}};
 if(pending)manifest.pendingCompatibilityUpdate={schema:1,file:'compatibility-contract.json',previousSHA256:sha(oldBytes),newSHA256:sha(newBytes),contentBase64:newBytes.toString('base64')};
 mutate(manifest);
 const manifestBytes=Buffer.from(JSON.stringify(manifest));fs.writeFileSync(path.join(root,'manifest.json'),manifestBytes);
 function run(shell,body){
  const script=`$ErrorActionPreference='Stop'
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$root=${quote(root)}
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(manager)},[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Manager syntax error'}
foreach($name in @('Assert-PackageFiles','Complete-PendingCompatibilityUpdate')){
 $definitions=@($ast.FindAll({param($entry) $entry -is [Management.Automation.Language.FunctionDefinitionAst] -and $entry.Name -ceq $name},$true))
 if($definitions.Count -ne 1){throw ('Missing or ambiguous function: '+$name)}
 . ([scriptblock]::Create($definitions[0].Extent.Text))
}
${body}
`;
  return JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024}).trim());
 }
 function cleanup(){
  if(path.dirname(path.resolve(root))!==path.resolve(area)||!path.basename(root).startsWith('manager-pending-'))throw Error('Unexpected fixture path');
  const manifestPath=path.join(root,'manifest.json');if(fs.existsSync(manifestPath))fs.chmodSync(manifestPath,0o666);
  fs.rmSync(root,{recursive:true,force:true});
 }
 return {root,oldBytes,newBytes,manifestBytes,run,cleanup};
}

test('pending completion is placed after both locks and before compatibility inspection',()=>{
 const source=fs.readFileSync(manager,'utf8');
 const maintenance=source.indexOf('$maintenance=Enter-XiaomuMaintenance $root');
 const session=source.indexOf("if(-not $lock){throw 'Another skin session is ending.'}");
 const complete=source.indexOf('  Complete-PendingCompatibilityUpdate');
 const inspect=source.indexOf('  $compatibility=Get-Compatibility',session);
 assert.ok(maintenance>0&&maintenance<session&&session<complete&&complete<inspect);
});

test('no pending update leaves every file and directory unchanged',()=>{
 for(const shell of shells){
  const f=fixture({pending:false});try{
   const result=f.run(shell,`Assert-PackageFiles
Complete-PendingCompatibilityUpdate
[pscustomobject]@{files=@(Get-ChildItem -LiteralPath $root -Force).Count;manifest=(Get-FileHash -LiteralPath (Join-Path $root 'manifest.json')).Hash}|ConvertTo-Json -Compress`);
   assert.equal(result.files,25);assert.equal(result.manifest.toLowerCase(),sha(f.manifestBytes));
  }finally{f.cleanup();}
 }
});

test('a valid pending contract commits both files, preserves metadata and retains verified backups',()=>{
 for(const shell of shells){
  const f=fixture();try{
   f.run(shell,`Assert-PackageFiles
Complete-PendingCompatibilityUpdate
Assert-PackageFiles
[pscustomobject]@{complete=$true}|ConvertTo-Json -Compress`);
   const manifest=JSON.parse(fs.readFileSync(path.join(f.root,'manifest.json')));
   assert.equal(manifest.files['compatibility-contract.json'],sha(f.newBytes));
   assert.equal(Object.keys(manifest.files).length,24);assert.equal(Object.hasOwn(manifest,'pendingCompatibilityUpdate'),false);
   assert.deepEqual(manifest.fixtureMetadata,{preserved:true});
   assert.deepEqual(fs.readFileSync(path.join(f.root,'compatibility-contract.json')),f.newBytes);
   const backups=fs.readdirSync(f.root).filter(name=>name.startsWith('pending-compatibility-backup-'));
   assert.equal(backups.length,1);
   assert.deepEqual(fs.readFileSync(path.join(f.root,backups[0],'manifest.json')),f.manifestBytes);
   assert.deepEqual(fs.readFileSync(path.join(f.root,backups[0],'compatibility-contract.json')),f.oldBytes);
   assert.equal(fs.readdirSync(f.root).some(name=>name.endsWith('.tmp')),false);
  }finally{f.cleanup();}
 }
});

test('invalid hashes, content, filenames and oversized contracts are rejected without writes',()=>{
 const cases=[
  value=>{value.pendingCompatibilityUpdate.previousSHA256='a'.repeat(64);},
  value=>{value.pendingCompatibilityUpdate.newSHA256='a'.repeat(64);},
  value=>{value.pendingCompatibilityUpdate.file='../outside.json';},
  value=>{value.pendingCompatibilityUpdate.schema=2;},
  value=>{const bytes=Buffer.from('{invalid-json');value.pendingCompatibilityUpdate.contentBase64=bytes.toString('base64');value.pendingCompatibilityUpdate.newSHA256=sha(bytes);},
  value=>{const bytes=Buffer.alloc(262145,32);value.pendingCompatibilityUpdate.contentBase64=bytes.toString('base64');value.pendingCompatibilityUpdate.newSHA256=sha(bytes);},
 ];
 for(const shell of shells)for(const mutate of cases){
  const f=fixture({mutate});try{
   const result=f.run(shell,`$failed=$false;try{Complete-PendingCompatibilityUpdate}catch{$failed=$true}
[pscustomobject]@{failed=$failed;files=@(Get-ChildItem -LiteralPath $root -Force).Count}|ConvertTo-Json -Compress`);
   assert.equal(result.failed,true);assert.equal(result.files,25);
   assert.deepEqual(fs.readFileSync(path.join(f.root,'manifest.json')),f.manifestBytes);
   assert.deepEqual(fs.readFileSync(path.join(f.root,'compatibility-contract.json')),f.oldBytes);
  }finally{f.cleanup();}
 }
});

test('a partial replacement failure restores known bytes and keeps backups',()=>{
 for(const shell of shells){
  const f=fixture();try{
   const result=f.run(shell,`$manifestPath=Join-Path $root 'manifest.json'
[IO.File]::SetAttributes($manifestPath,[IO.FileAttributes]::ReadOnly)
$failed=$false
try{Complete-PendingCompatibilityUpdate}catch{$failed=$true}finally{[IO.File]::SetAttributes($manifestPath,[IO.FileAttributes]::Normal)}
[pscustomobject]@{failed=$failed;backups=@(Get-ChildItem -LiteralPath $root -Directory -Filter 'pending-compatibility-backup-*').Count}|ConvertTo-Json -Compress`);
   assert.equal(result.failed,true);assert.equal(result.backups,1);
   assert.deepEqual(fs.readFileSync(path.join(f.root,'manifest.json')),f.manifestBytes);
   assert.deepEqual(fs.readFileSync(path.join(f.root,'compatibility-contract.json')),f.oldBytes);
  }finally{f.cleanup();}
 }
});

test('rollback preserves a concurrent unknown contract instead of overwriting it',()=>{
 for(const shell of shells){
  const f=fixture();try{
   const result=f.run(shell,`function Assert-PackageFiles{[IO.File]::WriteAllText((Join-Path $root 'compatibility-contract.json'),'concurrent-fixture-change');throw 'fixture-validation-failed'}
$failed=$false;try{Complete-PendingCompatibilityUpdate}catch{$failed=$true}
[pscustomobject]@{failed=$failed;contract=[IO.File]::ReadAllText((Join-Path $root 'compatibility-contract.json'));backups=@(Get-ChildItem -LiteralPath $root -Directory -Filter 'pending-compatibility-backup-*').Count}|ConvertTo-Json -Compress`);
   assert.equal(result.failed,true);assert.equal(result.contract,'concurrent-fixture-change');assert.equal(result.backups,1);
   assert.deepEqual(fs.readFileSync(path.join(f.root,'manifest.json')),f.manifestBytes);
  }finally{f.cleanup();}
 }
});

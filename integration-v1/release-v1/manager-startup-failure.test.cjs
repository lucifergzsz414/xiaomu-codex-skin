'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const manager=path.join(__dirname,'manager.ps1');
const maintenance=path.join(__dirname,'maintenance.ps1');
const area=path.resolve(process.env.XIAOMU_TEST_ROOT||'E:\\XiaomuCodexSkin\\github\\local-acceptance\\warm-reopen-20261115');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const shells=[path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe')];
let ps7=path.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell/7/pwsh.exe');
if(!fs.existsSync(ps7))try{ps7=execFileSync('where.exe',['pwsh.exe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).find(value=>fs.existsSync(value))||ps7;}catch{}
if(fs.existsSync(ps7))shells.push(ps7);

function fixture(){
 fs.mkdirSync(area,{recursive:true});
 const root=fs.mkdtempSync(path.join(area,'manager-startup-failure-'));
 const probe=path.join(root,'probe.ps1');
 fs.writeFileSync(probe,`$ErrorActionPreference='Stop'
. ${quote(maintenance)}
$root=${quote(root)}
$lock=$null;$mutex=$null;$sessionFree=$false;$maintenanceFree=$false
try{$lock=[IO.File]::Open((Join-Path $root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);$sessionFree=$true}catch{}
try{$mutex=Enter-XiaomuMaintenance $root 0;$maintenanceFree=$true}catch{}
if($lock){$lock.Dispose()};if($mutex){Exit-XiaomuMaintenance $mutex}
[pscustomobject]@{sessionFree=$sessionFree;maintenanceFree=$maintenanceFree}|ConvertTo-Json -Compress
`);
 function run(shell,body){
  const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$root=${quote(root)};$Mode='Start';$lock=$null;$maintenance=$null;$failureStage='launch';$engineExitCode=$null
$statusFile=Join-Path $root 'status.json'
$startupFailureFile=Join-Path $root 'startup-failure.json'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(manager)},[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Manager syntax error'}
foreach($definition in $ast.FindAll({param($entry) $entry -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
 . ([scriptblock]::Create($definition.Extent.Text))
}
. ${quote(maintenance)}
$main=@($ast.EndBlock.Statements|Where-Object {$_ -is [Management.Automation.Language.TryStatementAst]})[-1]
if(-not $main -or $main.CatchClauses.Count -ne 1 -or -not $main.Finally){throw 'Missing startup failure handler'}
# Keep the real catch/finally, replacing only its process exit so this isolated host can report assertions.
$catchText=(@($main.CatchClauses[0].Body.Statements|ForEach-Object {
 if($_ -is [Management.Automation.Language.ExitStatementAst]){'$script:exitRequested=$true'}else{$_.Extent.Text}
}) -join [Environment]::NewLine).Replace('[Windows.Forms.MessageBox]','[FixtureStartup.MessageBox]')
$handler=[scriptblock]::Create('try{throw $script:injectedFailure}catch{'+$catchText+'}finally'+$main.Finally.Extent.Text)
Add-Type -TypeDefinition 'namespace FixtureStartup { public static class MessageBox { public static System.Action OnShow; public static int Show(string text,string title) { if(OnShow!=null) OnShow(); return 0; } } }'
# Prevent the extracted catch from loading the real MessageBox assembly; no window is created.
function Add-Type {param([string]$AssemblyName)}
$script:dialogCount=0;$script:dialogLocks=$null;$script:exitRequested=$false
[FixtureStartup.MessageBox]::OnShow=[Action]{
 $script:dialogCount++
 $info=[Diagnostics.ProcessStartInfo]::new()
 $info.FileName=${quote(shell)}
 $info.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+${quote(probe)}+'"'
 $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
 $child=[Diagnostics.Process]::new();$child.StartInfo=$info
 try{
  $null=$child.Start();$output=$child.StandardOutput.ReadToEnd();$errorOutput=$child.StandardError.ReadToEnd()
  if(-not $child.WaitForExit(5000) -or $child.ExitCode -ne 0){throw 'Lock probe failed'}
  $script:dialogLocks=$output|ConvertFrom-Json
 }finally{$child.Dispose()}
}
${body}
`;
  return JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',stdio:'pipe',windowsHide:true,timeout:20000,maxBuffer:1024*1024}).trim());
 }
 function cleanup(){
  if(path.dirname(path.resolve(root))!==area||!path.basename(root).startsWith('manager-startup-failure-'))throw Error('Unexpected fixture path');
  fs.rmSync(root,{recursive:true,force:true});
 }
 return {root,run,cleanup};
}

test('a child can acquire both startup locks before the failure dialog returns',()=>{
 for(const shell of shells){
  const f=fixture();try{
   const result=f.run(shell,`$lock=[IO.File]::Open((Join-Path $root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$maintenance=Enter-XiaomuMaintenance $root
$script:injectedFailure=[InvalidOperationException]::new('Diagnostic port occupied.')
. $handler
[pscustomobject]@{dialogCount=$script:dialogCount;locks=$script:dialogLocks;exitRequested=$script:exitRequested;sessionCleared=($null -eq $lock);maintenanceCleared=($null -eq $maintenance)}|ConvertTo-Json -Compress`);
   assert.equal(result.dialogCount,1);assert.equal(result.exitRequested,true);
   assert.deepEqual(result.locks,{sessionFree:true,maintenanceFree:true},path.basename(shell));
   assert.equal(result.sessionCleared,true);assert.equal(result.maintenanceCleared,true);
  }finally{f.cleanup();}
 }
});

test('the last bounded failure survives later successful state updates without storing exception text',()=>{
 for(const shell of shells){
  const f=fixture();try{
   const result=f.run(shell,`$secret='fixture-private-text-'+('sensitive-'*1000)
$failureStage='listener-identity'
$script:injectedFailure=[InvalidOperationException]::new($secret)
. $handler
$exists=[IO.File]::Exists($startupFailureFile)
$before=if($exists){[IO.File]::ReadAllText($startupFailureFile)}else{''}
Save-State 'active'
$after=if([IO.File]::Exists($startupFailureFile)){[IO.File]::ReadAllText($startupFailureFile)}else{''}
[pscustomobject]@{exists=$exists;retained=($before -ceq $after);receipt=$(if($exists){$after|ConvertFrom-Json}else{$null});containsSecret=($after.Contains('fixture-private-text-') -or $after.Contains('sensitive-'));bytes=[Text.Encoding]::UTF8.GetByteCount($after);status=(Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json).status;controllerPid=$PID}|ConvertTo-Json -Depth 5 -Compress`);
   assert.equal(result.exists,true,path.basename(shell));assert.equal(result.retained,true);assert.equal(result.status,'active');
   assert.equal(result.containsSecret,false);assert.ok(result.bytes>0&&result.bytes<=1024);
   assert.deepEqual(Object.keys(result.receipt).sort(),['schema','atUtc','mode','failureStage','errorCode','exceptionHResult','controllerPid'].sort());
   assert.equal(result.receipt.schema,1);assert.equal(result.receipt.mode,'Start');assert.equal(result.receipt.failureStage,'listener-identity');
   assert.equal(result.receipt.errorCode,'listener-identity-failed');assert.equal(result.receipt.controllerPid,result.controllerPid);
   assert.equal(Number.isInteger(result.receipt.exceptionHResult),true);assert.match(result.receipt.atUtc,/Z$/);assert.ok(Number.isFinite(Date.parse(result.receipt.atUtc)));
  }finally{f.cleanup();}
 }
});

test('fixed launch failures have distinct codes and only the latest failure is retained',()=>{
 for(const shell of shells){
  const f=fixture();try{
   const result=f.run(shell,`$failureStage='launch'
$script:injectedFailure=[InvalidOperationException]::new('Diagnostic port occupied.')
. $handler
$first=if([IO.File]::Exists($startupFailureFile)){Get-Content -LiteralPath $startupFailureFile -Raw|ConvertFrom-Json}else{$null}
$script:injectedFailure=[InvalidOperationException]::new('Codex started concurrently.')
. $handler
$last=if([IO.File]::Exists($startupFailureFile)){Get-Content -LiteralPath $startupFailureFile -Raw|ConvertFrom-Json}else{$null}
[pscustomobject]@{first=$first.errorCode;last=$last.errorCode;count=@(Get-ChildItem -LiteralPath $root -Filter 'startup-failure*').Count;dialogCount=$script:dialogCount}|ConvertTo-Json -Compress`);
   assert.equal(result.first,'diagnostic-port-busy');assert.equal(result.last,'client-started-concurrently');
   assert.equal(result.count,1);assert.equal(result.dialogCount,2);
  }finally{f.cleanup();}
 }
});

test('an unwritable failure receipt still releases both locks before showing the failure dialog',()=>{
 for(const shell of shells){
  const f=fixture();try{
   fs.mkdirSync(path.join(f.root,'startup-failure.json'));
   const result=f.run(shell,`$lock=[IO.File]::Open((Join-Path $root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
$maintenance=Enter-XiaomuMaintenance $root
$script:injectedFailure=[InvalidOperationException]::new('fixture-failure')
. $handler
[pscustomobject]@{dialogCount=$script:dialogCount;locks=$script:dialogLocks;exitRequested=$script:exitRequested;failureSaved=$failureSaved}|ConvertTo-Json -Compress`);
   assert.equal(result.failureSaved,false);assert.equal(result.dialogCount,1);assert.equal(result.exitRequested,true);
   assert.deepEqual(result.locks,{sessionFree:true,maintenanceFree:true},path.basename(shell));
  }finally{f.cleanup();}
 }
});

test('startup failure and receipt-write failure retain their actual reasons on stderr',()=>{
 for(const shell of shells){
  const f=fixture();try{
   fs.mkdirSync(path.join(f.root,'startup-failure.json'));
   const result=f.run(shell,`$writer=[IO.StringWriter]::new()
$originalError=[Console]::Error
$script:injectedFailure=[InvalidOperationException]::new('fixture-specific-listener-failure')
try{[Console]::SetError($writer);. $handler}finally{[Console]::SetError($originalError)}
[pscustomobject]@{diagnostic=$writer.ToString();locks=$script:dialogLocks}|ConvertTo-Json -Compress`);
   assert.match(result.diagnostic,/\[xiaomu:launch\] fixture-specific-listener-failure/);
   assert.match(result.diagnostic,/\[xiaomu:save-startup-failure\].+startup-failure\.json/);
   assert.deepEqual(result.locks,{sessionFree:true,maintenanceFree:true});
  }finally{f.cleanup();}
 }
});

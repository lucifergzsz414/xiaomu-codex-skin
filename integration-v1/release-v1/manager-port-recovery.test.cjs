'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const manager=path.join(__dirname,'manager.ps1');
const area=path.resolve(process.env.XIAOMU_TEST_ROOT||'E:\\XiaomuCodexSkin\\github\\local-acceptance\\port-recovery-20261118\\tests');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const shells=[path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe')];
let ps7=path.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell/7/pwsh.exe');
if(!fs.existsSync(ps7))try{ps7=execFileSync('where.exe',['pwsh.exe'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).find(value=>fs.existsSync(value))||ps7;}catch{}
if(fs.existsSync(ps7))shells.push(ps7);

function run(shell,scenario){
 fs.mkdirSync(area,{recursive:true});
 const root=fs.mkdtempSync(path.join(area,'manager-port-'));
 try{
  fs.writeFileSync(path.join(root,'entrypoints.ps1'),"'{\"status\":\"fixture\"}'\n");
  const scenario64=Buffer.from(JSON.stringify(scenario)).toString('base64');
  const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PSModulePath=Join-Path $PSHOME 'Modules'
$root=${quote(root)};$Mode='Start';$OwnerPid=0;$OwnerStartUtc='';$session=7
$codex=[pscustomobject]@{PackageFullName='fixture-codex';Executable='fixture-codex.exe'}
$stopFile=Join-Path $root 'stop.flag';$statusFile=Join-Path $root 'status.json';$startupFailureFile=Join-Path $root 'startup-failure.json'
$startupPortDiagnostic=$null;$openingEligible=$false;$launchRequestedAtUtc=$null;$maintenance=$null
$scenario=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${scenario64}'))|ConvertFrom-Json
$script:ticks=0;$script:sleptMs=0;$script:launches=0;$script:identityCalls=0;$script:ownershipChecks=0;$script:listenerChecks=0
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile(${quote(manager)},[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Manager syntax error'}
foreach($definition in $ast.FindAll({param($entry) $entry -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
 . ([scriptblock]::Create($definition.Extent.Text))
}
# Execute the real Start launch branch and identity wait, excluding all engine/process startup.
$main=@($ast.EndBlock.Statements|Where-Object {$_ -is [Management.Automation.Language.TryStatementAst]})[-1]
$statements=@($main.Body.Statements)
$startIndex=-1;$engineIndex=-1
for($i=0;$i -lt $statements.Count;$i++){
 if($statements[$i] -is [Management.Automation.Language.IfStatementAst] -and $statements[$i].Extent.Text.Contains('# An already open normal client')){$startIndex=$i}
 if($statements[$i].Extent.Text -match '^\\$failureStage\\s*=\\s*''engine'''){$engineIndex=$i}
}
if($startIndex -lt 0 -or $engineIndex -le $startIndex){throw 'Startup branch fixture could not be isolated'}
$launchText=(@($statements[$startIndex..($engineIndex-1)]|ForEach-Object {$_.Extent.Text}) -join [Environment]::NewLine)
# The old branch enumerates listeners inline. Replace only that OS read with the same fixture source.
$launchText=$launchText.Replace('[Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()','@(Get-DreamSkinPortListeners -Port 9335)')
function Get-UiRows {
 if($null -ne $scenario.uiAtTick -and $script:ticks -ge [int]$scenario.uiAtTick){[pscustomobject]@{Id=771;StartUtc='2026-11-18T00:00:00Z'}}
}
function Get-DreamSkinCodexInstall {$codex}
function Exit-XiaomuMaintenance {param($Value)}
function Get-DreamSkinPortListeners {
 param([int]$Port)
 $script:listenerChecks++
 if($scenario.busy -and -not $script:releasedDuringOwnership -and ($null -eq $scenario.freeAtTick -or $script:ticks -lt [int]$scenario.freeAtTick)){
  $owner=if($script:changedDuringOwnership -or ($null -ne $scenario.foreignAtTick -and $script:ticks -ge [int]$scenario.foreignAtTick)){999}else{777}
  [pscustomobject]@{Port=$Port;LocalAddress='127.0.0.1';OwningProcess=$owner;PrivateText='must-not-be-logged'}
 }
}
function Test-DreamSkinCodexPortOwner {
 param([int]$Port,$Codex,[int]$ExpectedSessionId)
 $script:ownershipChecks++
 if($ExpectedSessionId -ne 7 -or $Codex.Executable -cne 'fixture-codex.exe'){throw 'Installation/session boundary was omitted'}
 if($scenario.releaseDuringOwnership){$script:releasedDuringOwnership=$true}
 if($scenario.foreignDuringOwnership){$script:changedDuringOwnership=$true}
 if($scenario.ownership -ceq 'error'){throw 'must-not-be-logged'}
 return $scenario.ownership -ceq 'codex' -and ($null -eq $scenario.foreignAtTick -or $script:ticks -lt [int]$scenario.foreignAtTick)
}
function Start-Sleep {
 param([int]$Milliseconds)
 $script:sleptMs+=$Milliseconds;$script:ticks++
 if($null -ne $scenario.stopAtTick -and $script:ticks -ge [int]$scenario.stopAtTick){[IO.File]::WriteAllText($stopFile,'stop')}
}
function Start-DreamSkinCodex {param($Codex,$Arguments);$script:launches++}
function Get-Identity {$script:identityCalls++;[pscustomobject]@{verified=$true}}
function Start-Process {throw 'Real process startup is forbidden in this fixture'}
function Stop-Process {throw 'Process termination is forbidden in this fixture'}
$complete=$false;$code=$null
try{. ([scriptblock]::Create($launchText));$complete=$true}catch{
 $info=Get-StartupFailureInfo $_ 'launch';$code=$info.code;Save-StartupFailure $_ 'launch' $code
}
$failure=if([IO.File]::Exists($startupFailureFile)){Get-Content -LiteralPath $startupFailureFile -Raw|ConvertFrom-Json}else{$null}
$status=if([IO.File]::Exists($statusFile)){(Get-Content -LiteralPath $statusFile -Raw|ConvertFrom-Json).status}else{$null}
[pscustomobject]@{complete=$complete;errorCode=$code;launches=$script:launches;identityCalls=$script:identityCalls;sleptMs=$script:sleptMs;ownershipChecks=$script:ownershipChecks;listenerChecks=$script:listenerChecks;failure=$failure;status=$status;openingEligible=$openingEligible}|ConvertTo-Json -Depth 6 -Compress
`;
  return JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024}).trim());
 }finally{
  if(path.dirname(path.resolve(root))!==area||!path.basename(root).startsWith('manager-port-'))throw Error('Unexpected fixture path');
  fs.rmSync(root,{recursive:true,force:true});
 }
}

for(const shell of shells){
 const label=path.basename(shell);
 test(`${label}: an idle port launches without a port wait`,()=>{
  const r=run(shell,{});assert.equal(r.complete,true);assert.equal(r.errorCode,null);assert.equal(r.launches,1);assert.equal(r.identityCalls,1);assert.equal(r.ownershipChecks,0);assert.equal(r.sleptMs,300);assert.equal(r.openingEligible,true);
 });
 test(`${label}: a closing verified Codex can release its port before launch`,()=>{
  const r=run(shell,{busy:true,ownership:'codex',freeAtTick:2});assert.equal(r.complete,true);assert.equal(r.errorCode,null);assert.equal(r.launches,1);assert.equal(r.identityCalls,1);assert.ok(r.ownershipChecks>=2);assert.equal(r.sleptMs,800);
 });
 test(`${label}: an appearing Codex is verified instead of launching a second instance`,()=>{
  const r=run(shell,{busy:true,ownership:'codex',uiAtTick:1});assert.equal(r.complete,true);assert.equal(r.errorCode,null);assert.equal(r.launches,0);assert.equal(r.identityCalls,1);assert.equal(r.sleptMs,250);assert.equal(r.openingEligible,false);
 });
 test(`${label}: the final launch check also reuses a newly appearing UI`,()=>{
  const r=run(shell,{uiAtTick:1});assert.equal(r.complete,true);assert.equal(r.errorCode,null);assert.equal(r.launches,0);assert.equal(r.identityCalls,1);assert.equal(r.sleptMs,300);assert.equal(r.openingEligible,false);
 });
 test(`${label}: a persistent verified owner has a bounded wait and diagnostic`,()=>{
  const r=run(shell,{busy:true,ownership:'codex'});assert.equal(r.errorCode,'diagnostic-port-busy');assert.equal(r.launches,0);assert.equal(r.identityCalls,0);assert.equal(r.sleptMs,3000);assert.equal(r.failure.diagnosticPort.number,9335);assert.deepEqual(r.failure.diagnosticPort.ownerPids,[777]);assert.equal(r.failure.diagnosticPort.ownership,'codex');assert.equal(r.failure.diagnosticPort.waitedMs,3000);
 });
 test(`${label}: an unverified listener is not adopted or waited on`,()=>{
  const r=run(shell,{busy:true,ownership:'other'});assert.equal(r.errorCode,'diagnostic-port-busy');assert.equal(r.launches,0);assert.equal(r.identityCalls,0);assert.equal(r.sleptMs,0);assert.equal(r.failure.diagnosticPort.ownership,'unverified');assert.deepEqual(r.failure.diagnosticPort.ownerPids,[777]);assert.equal(JSON.stringify(r.failure).includes('must-not-be-logged'),false);
 });
 for(const ownership of ['other','error'])test(`${label}: a port released during ownership lookup (${ownership}) is free`,()=>{
  const r=run(shell,{busy:true,ownership,releaseDuringOwnership:true});assert.equal(r.complete,true);assert.equal(r.errorCode,null);assert.equal(r.failure,null);assert.equal(r.launches,1);assert.equal(r.identityCalls,1);assert.equal(r.sleptMs,300);
 });
 test(`${label}: a changed PID during ownership lookup uses the final busy snapshot`,()=>{
  const r=run(shell,{busy:true,ownership:'other',foreignDuringOwnership:true});assert.equal(r.errorCode,'diagnostic-port-busy');assert.equal(r.launches,0);assert.equal(r.sleptMs,0);assert.equal(r.failure.diagnosticPort.ownership,'unverified');assert.deepEqual(r.failure.diagnosticPort.ownerPids,[999]);
 });
 test(`${label}: ownership changes during the wait remain a hard boundary`,()=>{
  const r=run(shell,{busy:true,ownership:'codex',foreignAtTick:1});assert.equal(r.errorCode,'diagnostic-port-busy');assert.equal(r.launches,0);assert.equal(r.identityCalls,0);assert.equal(r.sleptMs,250);assert.equal(r.failure.diagnosticPort.ownership,'unverified');assert.deepEqual(r.failure.diagnosticPort.ownerPids,[999]);
 });
 test(`${label}: a stop request interrupts the bounded wait`,()=>{
  const r=run(shell,{busy:true,ownership:'codex',stopAtTick:1});assert.equal(r.complete,true);assert.equal(r.launches,0);assert.equal(r.identityCalls,0);assert.equal(r.errorCode,null);assert.equal(r.status,'disabled');assert.equal(r.sleptMs,250);
 });
 test(`${label}: unavailable ownership is recorded without leaking its exception`,()=>{
  const r=run(shell,{busy:true,ownership:'error'});assert.equal(r.errorCode,'diagnostic-port-busy');assert.equal(r.launches,0);assert.equal(r.sleptMs,0);assert.equal(r.failure.diagnosticPort.ownership,'unavailable');assert.equal(JSON.stringify(r.failure).includes('must-not-be-logged'),false);
 });
 test(`${label}: an already running UI keeps its original identity path`,()=>{
  const r=run(shell,{busy:true,ownership:'other',uiAtTick:0});assert.equal(r.complete,true);assert.equal(r.launches,0);assert.equal(r.identityCalls,2);assert.equal(r.sleptMs,0);assert.equal(r.listenerChecks,0);
 });
}

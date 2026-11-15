'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=__dirname,evidence='E:\\XiaomuCodexSkin\\github\\local-acceptance\\update-manager-20261115',ps5=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const common=`$ErrorActionPreference='Stop'
. '${path.join(root,'control-actions.ps1').replaceAll("'","''")}' -Action Functions
function Assert($Condition,$Label){if(-not $Condition){throw $Label}}
function Reject($Block,$Label){$did=$false;try{& $Block|Out-Null}catch{$did=$true};Assert $did $Label}
function Release($Version='1.1.0'){$name='xiaomu-codex-skin-candidate-'+$Version+'.zip';return [pscustomobject]@{tag_name=('v'+$Version);draft=$false;prerelease=$false;html_url=('https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v'+$Version);assets=@([pscustomobject]@{name=$name;state='uploaded';size=100;digest=('sha256:'+('a'*64));browser_download_url=('https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v'+$Version+'/'+$name)})}}
function Local($Version='1.0.0',$Channel='stable',$Candidate='old') {return [pscustomobject]@{id='xiaomu-codex-skin';version=$Version;releaseLabel=$Version;releaseChannel=$Channel;candidateId=$Candidate}}
function Fixture($Base,$Version='1.1.0'){
 $skin=Join-Path $Base 'bundle\\skin';$null=New-Item -ItemType Directory -Path $skin -Force;$files=[ordered]@{}
 $names=@('maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js')+@(1..14|ForEach-Object{'managed-'+$_+'.txt'})
 foreach($name in $names){[IO.File]::WriteAllText((Join-Path $skin $name),'fixture '+$name);$files[$name]=(Get-FileHash (Join-Path $skin $name)).Hash.ToLowerInvariant()}
 $manifest=@{id='xiaomu-codex-skin';version=$Version;installationLayoutVersion='1.0.0';releaseLabel=$Version;releaseChannel='stable';candidateId='candidate-'+$Version;files=$files};[IO.File]::WriteAllText((Join-Path $skin 'manifest.json'),($manifest|ConvertTo-Json -Depth 5))
 foreach($name in @('INSTALL.vbs','README.md','USAGE.md','LICENSE','ASSET-SOURCES.md')){[IO.File]::WriteAllText((Join-Path $Base ('bundle\\'+$name)),'fixture')}
 [IO.File]::WriteAllText((Join-Path $Base 'bundle\\RELEASE-CANDIDATE.json'),(@{candidateId=$manifest.candidateId;releaseLabel=$Version;releaseChannel='stable';runtimeVersion=$Version;managedFilesVerified=24;packageManifestSHA256=(Get-FileHash (Join-Path $skin 'manifest.json')).Hash;publicationStatusAtBuild='local-candidate-not-published'}|ConvertTo-Json))
 Seal $Base
 return $skin
}
function Seal($Base){$bundle=Join-Path $Base 'bundle';$checks=[ordered]@{};Get-ChildItem $bundle -Recurse -File|Where-Object Name -ne 'FILES-SHA256.json'|ForEach-Object{$checks[$_.FullName.Substring($bundle.Length+1).Replace('\\','/')]=(Get-FileHash $_.FullName).Hash.ToLowerInvariant()};[IO.File]::WriteAllText((Join-Path $bundle 'FILES-SHA256.json'),($checks|ConvertTo-Json));$zip=Join-Path $Base 'package.zip';if(Test-Path $zip){Remove-Item -LiteralPath $zip};Add-Type -AssemblyName System.IO.Compression.FileSystem;Add-Type -AssemblyName System.IO.Compression;$a=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create);try{Get-ChildItem $bundle -File -Recurse|ForEach-Object{$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($a,$_.FullName,$_.FullName.Substring($bundle.Length+1).Replace('\\','/'))}}finally{$a.Dispose()}}
function ZipRelease($Base){$r=Get-ControlRelease (Release);$r.size=(Get-Item (Join-Path $Base 'package.zip')).Length;$r.sha256=(Get-FileHash (Join-Path $Base 'package.zip')).Hash.ToLowerInvariant();return $r}
`;
function run(body){fs.mkdirSync(evidence,{recursive:true});const base=fs.mkdtempSync(path.join(evidence,'worker-test-'));const script=path.join(base,'test.ps1');fs.writeFileSync(script,'\ufeff'+common+`\n$base='${base.replaceAll("'","''")}'\n`+body+"\n'PASS'\n");const env={...process.env,PSModulePath:[path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules'),path.join(process.env.ProgramFiles,'WindowsPowerShell/Modules')].join(';')};delete env.NODE_TEST_CONTEXT;const result=spawnSync(process.env.XIAOMU_UPDATE_TEST_POWERSHELL||ps5,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true,timeout:45000,env});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PASS/);}
test('updater versions distinguish stable, local and numeric order', {skip:process.platform!=='win32'},()=>run(`
Assert ((ConvertTo-ControlVersion '1.10.0') -gt (ConvertTo-ControlVersion '1.9.0')) 'numeric versions'
foreach($bad in @('1.0','01.0.0','1.0.0-rc1','1.0.0.1','1.2147483648.0')){Reject {ConvertTo-ControlVersion $bad} ('invalid '+$bad)}
$same=Get-ControlUpdateState (Local) (Get-ControlRelease (Release '1.0.0'));Assert (-not $same.canUpdate -and $same.state -eq 'current') 'stable current'
$local=Get-ControlUpdateState (Local '1.0.0' 'local-test') (Get-ControlRelease (Release '1.0.0'));Assert ($local.canUpdate -and $local.state -eq 'available' -and $local.currentVersion -match 'local-test') 'local is not stable'
$ahead=Get-ControlUpdateState (Local '1.2.0') (Get-ControlRelease (Release));Assert (-not $ahead.canUpdate -and $ahead.state -eq 'ahead') 'no downgrade'
Assert (Test-ControlUpgrade (Local '1.1.0') (Local)) 'external newer bootstrap'
Assert (-not (Test-ControlUpgrade (Local) (Local))) 'same stable idempotent'
$s=Fixture $base;Assert ((Test-ControlPackage $s).version -eq '1.1.0') 'product version separate from layout'
$manifestPath=Join-Path $s 'manifest.json';$m=Get-Content $manifestPath -Raw -Encoding utf8|ConvertFrom-Json;$m.installationLayoutVersion=$null;[IO.File]::WriteAllText($manifestPath,($m|ConvertTo-Json -Depth 5));Reject {Test-ControlPackage $s} 'explicit null layout rejected'
$m.PSObject.Properties.Remove('installationLayoutVersion');[IO.File]::WriteAllText($manifestPath,($m|ConvertTo-Json -Depth 5));Reject {Test-ControlPackage $s} 'new product requires layout'
$m.version='1.0.0';[IO.File]::WriteAllText($manifestPath,($m|ConvertTo-Json -Depth 5));Assert ((Test-ControlPackage $s).version -eq '1.0.0') 'old layout manifest accepted'
`));
test('updater release and redirect validators reject untrusted metadata', {skip:process.platform!=='win32'},()=>run(`
$r=Get-ControlRelease (Release);Assert ($r.version -eq '1.1.0') 'release accepted'
foreach($field in @('draft','prerelease')){$api=Release;$api.$field=$true;Reject {Get-ControlRelease $api} $field}
$api=Release;$api.assets+=@($api.assets[0]);Reject {Get-ControlRelease $api} 'ambiguous zip'
$api=Release;$api.assets[0].digest='';Reject {Get-ControlRelease $api} 'digest required'
$api=Release;$api.assets[0].browser_download_url='https://github.com/other/repo/a.zip';Reject {Get-ControlRelease $api} 'fixed repo'
foreach($url in @('http://github.com/a','https://github.com:444/a','https://u@github.com/a','https://github.com.evil/a','https://api.github.com/a')){Reject {Test-ControlDownloadUri $url} $url}
$null=Test-ControlDownloadUri 'https://release-assets.githubusercontent.com/a?signature=secret'
`));
test('updater validates complete zip before extraction or script execution', {skip:process.platform!=='win32'},()=>run(`
$s=Fixture $base;$r=ZipRelease $base;$out=Join-Path $base 'out';$ok=Expand-ControlUpdate (Join-Path $base 'package.zip') $out $r;Assert ($ok.manifest.version -eq '1.1.0') 'complete package'
$r.sha256='0'*64;Reject {Expand-ControlUpdate (Join-Path $base 'package.zip') (Join-Path $base 'bad-hash') $r} 'archive digest';Assert (-not (Test-Path (Join-Path $base 'bad-hash'))) 'no extraction before digest'
$r=ZipRelease $base;[IO.File]::WriteAllText((Join-Path $s 'install.ps1'),'throw malicious');Seal $base;$r=ZipRelease $base;Reject {Expand-ControlUpdate (Join-Path $base 'package.zip') (Join-Path $base 'changed') $r} 'managed digest'
`));
test('updater rejects traversal, duplicates, links and invalid Windows zip names', {skip:process.platform!=='win32'},()=>run(`
Add-Type -AssemblyName System.IO.Compression.FileSystem;Add-Type -AssemblyName System.IO.Compression
foreach($name in @('../outside','/absolute','skin\\outside','skin/a:b','skin/CON.txt','skin/a.','skin/a ')){
 $zip=Join-Path $base 'bad.zip';$archive=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create);try{$null=$archive.CreateEntry($name);1..31|ForEach-Object{$null=$archive.CreateEntry('filler'+$_)}}finally{$archive.Dispose()};$r=Get-ControlRelease (Release);$r.size=(Get-Item $zip).Length;$r.sha256=(Get-FileHash $zip).Hash;Reject {Expand-ControlUpdate $zip (Join-Path $base 'out') $r} $name;Assert (-not (Test-Path (Join-Path $base 'out'))) 'unsafe path rejected before extraction';Remove-Item -LiteralPath $zip
}
$zip=Join-Path $base 'bad.zip';$a=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create);try{$null=$a.CreateEntry('skin/a');$null=$a.CreateEntry('skin/A');1..30|ForEach-Object{$null=$a.CreateEntry('filler'+$_)}}finally{$a.Dispose()};$r.size=(Get-Item $zip).Length;$r.sha256=(Get-FileHash $zip).Hash;Reject {Expand-ControlUpdate $zip (Join-Path $base 'out') $r} 'case duplicate';Remove-Item -LiteralPath $zip
$a=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create);try{$entry=$a.CreateEntry('link');$entry.ExternalAttributes=-1610612736;1..31|ForEach-Object{$null=$a.CreateEntry('filler'+$_)}}finally{$a.Dispose()};$r.size=(Get-Item $zip).Length;$r.sha256=(Get-FileHash $zip).Hash;Reject {Expand-ControlUpdate $zip (Join-Path $base 'out') $r} 'unix link'
`));
test('zip stream copy rejects forged central-directory lengths before excess writes', {skip:process.platform!=='win32'},()=>run(`
$source=Fixture $base;[IO.File]::WriteAllBytes((Join-Path $source 'skin.js'),(New-Object byte[] 2097152));Seal $base
$zip=Join-Path $base 'package.zip';$bytes=[IO.File]::ReadAllBytes($zip);$patched=$false
for($i=0;$i -lt $bytes.Length-46;$i++){
 if([BitConverter]::ToUInt32($bytes,$i) -eq 33639248){$length=[BitConverter]::ToUInt16($bytes,$i+28);$name=[Text.Encoding]::UTF8.GetString($bytes,$i+46,$length);if($name -ceq 'skin/skin.js'){[Array]::Copy([BitConverter]::GetBytes([uint32]1),0,$bytes,$i+24,4);$patched=$true;break}}
}
Assert $patched 'central directory patched';[IO.File]::WriteAllBytes($zip,$bytes);$r=ZipRelease $base;$out=Join-Path $base 'out'
Reject {Expand-ControlUpdate $zip $out $r} 'forged length rejected'
Assert ((Get-Item (Join-Path $out 'skin/skin.js')).Length -le 1) 'no excess decompressed bytes written'
`));
test('updater handoff waits for manager, revalidates and stops only skin before repair', {skip:process.platform!=='win32'},()=>run(`
function Get-ControlPaths {return [pscustomobject]@{target=(Join-Path $base 'installed');updates=(Join-Path $base 'updates')}}
$old=Fixture (Join-Path $base 'old') '1.0.0';Copy-Item -LiteralPath $old -Destination (Join-Path $base 'installed') -Recurse
$stage=Join-Path $base ('updates\\'+[guid]::NewGuid().ToString('N'));$source=Fixture $stage;$release=ZipRelease $stage;$verified=Expand-ControlUpdate (Join-Path $stage 'package.zip') (Join-Path $stage 'verified') $release
function Get-ControlManagerIdentity {return [pscustomobject]@{pid=42;startUtc='2026-11-15T00:00:00.0000000Z';path=(Join-Path $base 'manager\\XiaomuSkinManager.exe')}}
function Assert-ControlManagerParent {}
function Start-ControlHandoff($Worker,$Ticket){$script:launched=$Ticket}
$ticket=New-ControlUpdateHandoff $stage $release $verified 42 '2026-11-15T00:00:00.0000000Z' $PSScriptRoot
Assert (Test-Path $ticket) 'ticket persisted';Assert ($ticket -eq $script:launched) 'detached handoff launched'
$script:order=New-Object 'System.Collections.Generic.List[string]'
function Wait-ControlManagerExit($Identity){$script:order.Add('wait')}
function Enter-ControlUpdateMaintenance($Source,$Target,$Manifest){$script:order.Add('enter');return 'fixture-gate'}
function Exit-ControlUpdateMaintenance($Gate){if($Gate){$script:order.Add('exit')}}
function Stop-ControlSession($Root){$script:order.Add('stop')}
function Invoke-ControlRepair($Source,$Target){$script:order.Add('repair')}
function Open-ControlCenter($Root){$script:order.Add('open')}
Invoke-ControlApplyUpdate $ticket
Assert (($script:order -join ',') -eq 'wait,enter,stop,repair,exit,open') 'handoff ordering under maintenance lock'
Assert ((Get-Content (Join-Path $stage 'result.json') -Raw -Encoding utf8|ConvertFrom-Json).ok) 'durable success'
function Enter-ControlUpdateMaintenance($Source,$Target,$Manifest){$script:order.Add('enter');[IO.File]::WriteAllText((Join-Path $Target 'manifest.json'),'concurrent');return 'fixture-gate'}
$script:order.Clear();Reject {Invoke-ControlApplyUpdate $ticket} 'concurrent target guard';Assert (($script:order -join ',') -eq 'wait,enter,exit') 'target guard runs inside lock and never stops changed target'
[IO.File]::WriteAllText((Join-Path $verified.source 'skin.js'),'changed');$script:order.Clear();Reject {Invoke-ControlApplyUpdate $ticket} 'source changed';Assert (-not ($script:order -contains 'stop')) 'no stop when source changed'
`));
test('update failures are separate from runtime and manager timeout never replaces files', {skip:process.platform!=='win32'},()=>run(`
function Get-ControlPaths {return [pscustomobject]@{target=(Join-Path $base 'installed');updates=(Join-Path $base 'updates')}}
$old=Fixture (Join-Path $base 'old') '1.0.0';Copy-Item -LiteralPath $old -Destination (Join-Path $base 'installed') -Recurse
function Get-ControlLatestRelease {throw 'offline'}
function Stop-ControlSession {throw 'must not stop'}
$errorResult=Invoke-ControlUpdateAction 'CheckUpdate' $old 0 '';Assert (-not $errorResult.ok -and $errorResult.kind -eq 'update' -and -not $errorResult.closeManagerForUpdate) 'update error isolated'
Assert (-not (Test-Path (Join-Path $base 'installed\\stop.flag'))) 'runtime untouched'
$stage=Join-Path $base ('updates\\'+[guid]::NewGuid().ToString('N'));$null=Fixture $stage;$r=ZipRelease $stage;$v=Expand-ControlUpdate (Join-Path $stage 'package.zip') (Join-Path $stage 'verified') $r
function Get-ControlManagerIdentity {return [pscustomobject]@{pid=42;startUtc='2026-11-15T00:00:00.0000000Z';path='XiaomuSkinManager.exe'}}
function Assert-ControlManagerParent {}
function Start-ControlHandoff {}
$ticket=New-ControlUpdateHandoff $stage $r $v 42 '2026-11-15T00:00:00.0000000Z' $old
function Wait-ControlManagerExit {throw 'timeout'}
function Invoke-ControlRepair {throw 'must not replace'}
$script:opened=0
function Open-ControlCenter {$script:opened++}
Reject {Invoke-ControlApplyUpdate $ticket} 'manager timeout'
Assert (-not (Get-Content (Join-Path $stage 'result.json') -Raw -Encoding utf8|ConvertFrom-Json).ok) 'durable failure'
Assert ($script:opened -eq 1) 'intact old manager reopened'
Assert (-not (Get-ControlUpdateResult).ok) 'last result is readable without network'
[IO.File]::WriteAllText((Join-Path $base 'installed\\skin.js'),'damaged');Reject {Invoke-ControlApplyUpdate $ticket} 'failed with damaged manager';Assert ($script:opened -eq 1) 'damaged manager never opened'
Copy-Item -LiteralPath (Join-Path $old 'skin.js') -Destination (Join-Path $base 'installed\\skin.js') -Force
function Assert-ControlPath($Path){if($Path -ieq (Join-Path $base 'installed')){throw 'unsafe linked target'}}
Reject {Invoke-ControlApplyUpdate $ticket} 'linked target rejected';Assert ($script:opened -eq 1) 'linked ancestor never reopens even when final package hashes pass'
`));

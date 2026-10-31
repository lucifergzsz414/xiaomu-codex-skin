$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'control-actions.ps1') -Action Functions
$testRoot=Join-Path $PSScriptRoot ('test-output\control-tests-'+[guid]::NewGuid().ToString('N'))
$null=New-Item -ItemType Directory -Path $testRoot -Force
$files=[ordered]@{}
foreach($name in @('maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js')){
  [IO.File]::WriteAllText((Join-Path $testRoot $name),'fixture')
  $files[$name]=(Get-FileHash -LiteralPath (Join-Path $testRoot $name) -Algorithm SHA256).Hash
}
function Write-Manifest($Entries){[IO.File]::WriteAllText((Join-Path $testRoot 'manifest.json'),(@{id='xiaomu-codex-skin';version='1.0.0';files=$Entries}|ConvertTo-Json -Depth 4))}
function Assert-Equal($Actual,$Expected,$Label){if($Actual -cne $Expected){throw ($Label+': '+$Actual)};Write-Output ('PASS '+$Label)}
function Assert-Rejected($Block,$Label){$rejected=$false;try{& $Block|Out-Null}catch{$rejected=$true};if(-not $rejected){throw $Label};Write-Output ('PASS '+$Label)}
Write-Manifest $files
 $omitted=[ordered]@{};foreach($entry in $files.GetEnumerator()){if($entry.Key -ne 'install.ps1'){$omitted[$entry.Key]=$entry.Value}}
Write-Manifest $omitted
Assert-Rejected {Test-ControlPackage $testRoot} 'unlisted installer is rejected even if file exists'
Write-Manifest $files
Assert-Equal (Test-ControlPackage $testRoot).version '1.0.0' 'complete package passes hash validation'
[IO.File]::WriteAllText((Join-Path $testRoot 'skin.js'),'changed')
Assert-Rejected {Test-ControlPackage $testRoot} 'modified package is rejected'
[IO.File]::WriteAllText((Join-Path $testRoot 'skin.js'),'fixture')
$invalid=[ordered]@{};foreach($entry in $files.GetEnumerator()){$invalid[$entry.Key]=$entry.Value};$invalid['..\outside.ps1']='a'*64
Write-Manifest $invalid
Assert-Rejected {Test-ControlPackage $testRoot} 'manifest traversal is rejected'
$invalid.Remove('..\outside.ps1');$invalid.Remove('manager.ps1');Write-Manifest $invalid
Assert-Rejected {Test-ControlPackage $testRoot} 'missing manager is rejected'
Write-Manifest $files
function Write-Status($Time){[IO.File]::WriteAllText((Join-Path $testRoot 'status.json'),(@{status='active';activePages=1;atUtc=$Time}|ConvertTo-Json))}
Write-Status ([datetime]::UtcNow.ToString('o'))
Assert-Equal (Get-ControlRuntime $testRoot) 'stopped' 'stale active status without session lock is not running'
$lock=[IO.File]::Open((Join-Path $testRoot 'session.lock'),[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{
  Assert-Equal (Get-ControlRuntime $testRoot) 'active' 'fresh heartbeat and held lock report active'
  Write-Status ([datetime]::UtcNow.AddMinutes(-2).ToString('o'))
  Assert-Equal (Get-ControlRuntime $testRoot) 'checking' 'old heartbeat is not presented as active'
  [IO.File]::WriteAllText((Join-Path $testRoot 'stop.flag'),'stop')
  Assert-Equal (Get-ControlRuntime $testRoot) 'stopping' 'pending stop is distinct from completed pause'
}finally{$lock.Dispose()}
Assert-Equal (Get-ControlRuntime $testRoot) 'paused' 'completed pause retains its state'
[IO.File]::WriteAllText((Join-Path $testRoot 'control-state.json'),' {"action":"Restore"}')
Assert-Equal (Get-ControlRuntime $testRoot) 'restored' 'restore is distinct from pause'
Write-Output '11 control-state and integrity checks passed; fixtures retained in test-output.'

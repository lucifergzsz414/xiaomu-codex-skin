[CmdletBinding()]
param([ValidateSet('Start','Attach','Stop','Verify','Inspect')][string]$Mode='Start',[int]$OwnerPid=0,[string]$OwnerStartUtc='',[switch]$Resume)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$root=$PSScriptRoot
$stopFile=Join-Path $root 'stop.flag'
$statusFile=Join-Path $root 'status.json'
$openingEligible=$false
$launchRequestedAtUtc=$null
function Save-State([string]$state,[string]$failureStage='',[Nullable[int]]$engineExitCode=$null){
  $value=[ordered]@{atUtc=[datetime]::UtcNow.ToString('o');status=$state}
  if($failureStage){$value.failureStage=$failureStage}
  if($null -ne $engineExitCode){$value.engineExitCode=$engineExitCode}
  [IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
if($Mode -eq 'Stop'){
  [IO.File]::WriteAllText($stopFile,'stop')
  for($i=0;$i -lt 225;$i++){
    $handle=$null
    try{$handle=[IO.File]::Open((Join-Path $root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{Start-Sleep -Milliseconds 200;continue}
    if($handle){$handle.Dispose();return}
  }
  throw 'Restore is still pending; no process was killed.'
}
function Assert-PackageFiles {
  $manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw -Encoding utf8|ConvertFrom-Json
  foreach($property in $manifest.files.PSObject.Properties){
    if($property.Name -notmatch '^[A-Za-z0-9._-]+$'){throw 'Invalid package entry.'}
    if((Get-FileHash -LiteralPath (Join-Path $root $property.Name) -Algorithm SHA256).Hash -ine $property.Value){throw 'Skin package changed.'}
  }
}
Assert-PackageFiles
. (Join-Path $root 'config-utf8.ps1')
. (Join-Path $root 'common-windows.ps1')
$codex=Get-DreamSkinCodexInstall
$session=(Get-Process -Id $PID).SessionId
if($codex.PackageFamilyName -cne 'OpenAI.Codex_2p2nqsd0c76g0' -or $codex.SignatureKind -ine 'Store'){throw 'Unexpected official package.'}
$registration=Get-AppxPackage -Name OpenAI.Codex
if($registration.IsDevelopmentMode){throw 'Development package is not supported.'}
$archive=Join-Path $codex.PackageRoot 'app\resources\app.asar'
$compatibilityFile=Join-Path $root 'compatibility.json'
$node='C:\Program Files\nodejs\node.exe'
$exeHash=(Get-FileHash -LiteralPath $codex.Executable -Algorithm SHA256).Hash
function Test-CompatibilityIdentity($receipt){
  if($null -eq $receipt -or $receipt.schema -ne 1 -or $receipt.packageFullName -cne $codex.PackageFullName -or $receipt.executableSha256 -cne $exeHash){return $false}
  $archiveInfo=Get-Item -LiteralPath $archive -ErrorAction Stop
  $contractHash=(Get-FileHash -LiteralPath (Join-Path $root 'compatibility-contract.json') -Algorithm SHA256).Hash
  $exactTime=$archiveInfo.LastWriteTimeUtc.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture)
  if($receipt.archiveMtimeFileTimeUtc -isnot [string] -or $receipt.archiveMtimeFileTimeUtc -cne $exactTime -or $receipt.archiveSize -ne $archiveInfo.Length -or $receipt.contractSha256 -cne $contractHash){return $false}
  foreach($feature in @('core','sidebar','pages','panels','overlays','contextMenus')){if($receipt.capabilities.$feature -isnot [bool]){return $false}}
  return $receipt.core -is [bool] -and $receipt.core -eq $receipt.capabilities.core
}
function Get-Compatibility {
  if(Test-Path -LiteralPath $compatibilityFile){
    try{$cached=Get-Content -LiteralPath $compatibilityFile -Raw -Encoding utf8|ConvertFrom-Json;if(-not $cached.inspectionFailed -and (Test-CompatibilityIdentity $cached)){return $cached}}catch{}
  }
  if(-not [IO.File]::Exists($node)){throw 'Node.js runtime is unavailable.'}
  try{
    $json=& $node (Join-Path $root 'compatibility.cjs') $archive
    if($LASTEXITCODE -ne 0){throw 'Installed component inspection failed.'}
    $result=$json|ConvertFrom-Json
  }catch{
    $info=Get-Item -LiteralPath $archive -ErrorAction Stop
    $result=[pscustomobject]@{schema=1;core=$false;mode='unsupported';disabled=@('core','sidebar','pages','panels','overlays','contextMenus');capabilities=[pscustomobject]@{core=$false;sidebar=$false;pages=$false;panels=$false;overlays=$false;contextMenus=$false};archiveSize=$info.Length;archiveMtimeUtc=$info.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ');archiveMtimeFileTimeUtc=$info.LastWriteTimeUtc.ToFileTimeUtc().ToString([Globalization.CultureInfo]::InvariantCulture);inspectionFailed=$true}
  }
  $result|Add-Member -NotePropertyName packageFullName -NotePropertyValue $codex.PackageFullName
  $result|Add-Member -NotePropertyName packageVersion -NotePropertyValue $codex.Version
  $result|Add-Member -NotePropertyName executableSha256 -NotePropertyValue $exeHash
  $result|Add-Member -NotePropertyName contractSha256 -NotePropertyValue (Get-FileHash -LiteralPath (Join-Path $root 'compatibility-contract.json') -Algorithm SHA256).Hash
  $result|Add-Member -NotePropertyName checkedAtUtc -NotePropertyValue ([datetime]::UtcNow.ToString('o'))
  if(-not (Test-CompatibilityIdentity $result)){throw 'Package changed during component inspection.'}
  return $result
}
function Get-UiRows {
  foreach($p in @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue)){
    try{if($p.HasExited){continue};if(-not $p.Path){throw 'Uninspectable UI process.'};if($p.Path -ieq $codex.Executable -and $p.SessionId -eq $session){[pscustomobject]@{Id=$p.Id;StartUtc=$p.StartTime.ToUniversalTime().ToString('o')}}}
    catch{$gone=$false;try{$gone=$p.HasExited}catch{};if(-not $gone){throw}}
    finally{$p.Dispose()}
  }
}
function Get-Identity {
  $receipt=Get-Content -LiteralPath $compatibilityFile -Raw -Encoding utf8|ConvertFrom-Json
  if(-not (Test-CompatibilityIdentity $receipt) -or -not $receipt.core){throw 'Codex component identity changed.'}
  $startArgument=if($OwnerPid -gt 0){$OwnerStartUtc}else{'-'}
  $json=& (Join-Path $root 'owner-check.exe') 'discover' $codex.PackageFullName $codex.Executable $exeHash ([string]$session) ([string]$OwnerPid) $startArgument
  if($LASTEXITCODE -ne 0){throw 'Listener identity mismatch.'}
  $identity=$json|ConvertFrom-Json
  $identity|Add-Member -NotePropertyName executable -NotePropertyValue $codex.Executable
  return $identity
}
if($Mode -eq 'Verify'){$null=Get-Identity;'verified';return}
if($Mode -eq 'Inspect'){$compatibility=Get-Compatibility;[pscustomobject]@{supported=$compatibility.core;compatibility=$compatibility.mode;disabled=$compatibility.disabled;packageVersion=$codex.Version;uiCount=@(Get-UiRows).Count;mode='read-only'}|ConvertTo-Json;return}
$lock=$null
. (Join-Path $root 'maintenance.ps1')
$maintenance=Enter-XiaomuMaintenance $root
$failureStage='session-lock'
$engineExitCode=$null
try{
  for($attempt=0;$attempt -lt 40;$attempt++){
    try{$lock=[IO.File]::Open((Join-Path $root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None);break}
    catch{if(@(Get-UiRows).Count -gt 0){return};Start-Sleep -Milliseconds 250}
  }
  if(-not $lock){throw 'Another skin session is ending.'}
  $failureStage='compatibility'
  $compatibility=Get-Compatibility
  [IO.File]::WriteAllText($compatibilityFile,($compatibility|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
  if(-not $compatibility.core){
    Save-State 'unsupported-structure-skin-disabled'
    if($Mode -eq 'Start'){
      if(@(Get-UiRows).Count -eq 0){$null=Start-DreamSkinCodex -Codex $codex -Arguments @()}
      Add-Type -AssemblyName System.Windows.Forms
      $null=[Windows.Forms.MessageBox]::Show('Codex 界面结构已变化，小睦皮肤暂时保留原界面。兼容检查结果位于安装目录 compatibility.json。','小睦 Codex')
    }
    return
  }
  if([IO.File]::Exists($stopFile)){if($Resume){Save-State 'disabled';return};[IO.File]::Delete($stopFile)}
  if($Mode -ne 'Start'){Exit-XiaomuMaintenance $maintenance;$maintenance=$null}
  if($Mode -eq 'Start'){
    $failureStage='launch'
    try{
      $entryResult=& (Join-Path $root 'entrypoints.ps1') -Mode Apply
      [IO.File]::WriteAllText((Join-Path $root 'entrypoints-last-run.json'),($entryResult -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false))
    }catch{[IO.File]::WriteAllText((Join-Path $root 'entrypoints-last-run.json'),'{"status":"check-required"}',[Text.UTF8Encoding]::new($false))}
    Exit-XiaomuMaintenance $maintenance;$maintenance=$null
    # An already open normal client cannot gain CDP. Wait for a normal exit;
    # never kill windows or interrupt other chats to change its launch flags.
    if(@(Get-UiRows).Count -gt 0){
      $ready=$false;try{$null=Get-Identity;$ready=$true}catch{}
      if(-not $ready){
        Save-State 'waiting-for-client-exit'
        $deadline=[datetime]::UtcNow.AddMinutes(10)
        while(@(Get-UiRows).Count -gt 0){
          if([IO.File]::Exists($stopFile)){Save-State 'disabled';return}
          if([datetime]::UtcNow -gt $deadline){Save-State 'manual-relaunch-required';return}
          Start-Sleep -Milliseconds 500
        }
      }
    }
    if(@(Get-UiRows).Count -eq 0){
      if((Get-DreamSkinCodexInstall).PackageFullName -cne $codex.PackageFullName){
        Save-State 'rechecking-updated-client'
        $null=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $root 'manager.ps1')+'"'),'-Mode','Start','-Resume') -WindowStyle Hidden -PassThru
        return
      }
      if(@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()|Where-Object {$_.Port -eq 9335}).Count -gt 0){throw 'Diagnostic port occupied.'}
      Start-Sleep -Milliseconds 300
      if([IO.File]::Exists($stopFile)){Save-State 'disabled';return}
      if(@(Get-UiRows).Count -ne 0){throw 'Codex started concurrently.'}
      $launchRequestedAtUtc=[datetime]::UtcNow.ToString('o')
      $null=Start-DreamSkinCodex -Codex $codex -Arguments @('--remote-debugging-address=127.0.0.1','--remote-debugging-port=9335')
      $openingEligible=$true
    }
  }
  $failureStage='listener-identity'
  $identity=$null
  for($i=0;$i -lt 45;$i++){try{$identity=Get-Identity;break}catch{if($Mode -eq 'Attach'){throw};Start-Sleep -Milliseconds 500}}
  if(-not $identity){Save-State 'exit-normal-codex-before-skin-start';throw 'Exit normal Codex, then use the Xiaomu desktop entry.'}
  if([IO.File]::Exists($stopFile)){Save-State 'disabled';return}
  $failureStage='engine'
  $node='C:\Program Files\nodejs\node.exe'
  if(-not [IO.File]::Exists($node)){throw 'Node.js runtime is unavailable.'}
  if($launchRequestedAtUtc){$identity|Add-Member -NotePropertyName launchRequestedAtUtc -NotePropertyValue $launchRequestedAtUtc}
  $identity|Add-Member -NotePropertyName openingEligible -NotePropertyValue ([bool]$openingEligible)
  $encoded=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($identity|ConvertTo-Json -Compress)))
  & $node (Join-Path $root 'engine.cjs') $encoded
  $engineExitCode=$LASTEXITCODE
  if($engineExitCode -ne 0){throw 'Skin session stopped; inspect status.json.'}
}catch{
  if($lock){try{Save-State 'stopped-check-required' $failureStage $engineExitCode}catch{}}
  if($Mode -eq 'Start'){
    Add-Type -AssemblyName System.Windows.Forms
    $null=[Windows.Forms.MessageBox]::Show('Xiaomu skin could not start. Exit Codex fully, then use the Xiaomu desktop entry. Official Codex files were not changed.','Xiaomu Codex')
  }
  exit 1
}finally{if($lock){$lock.Dispose()};Exit-XiaomuMaintenance $maintenance}

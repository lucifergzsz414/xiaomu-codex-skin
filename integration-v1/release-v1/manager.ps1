[CmdletBinding()]
param([ValidateSet('Start','Attach','Stop','Verify','Inspect')][string]$Mode='Start',[int]$OwnerPid=0,[string]$OwnerStartUtc='',[switch]$Resume)
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$root=$PSScriptRoot
$stopFile=Join-Path $root 'stop.flag'
$statusFile=Join-Path $root 'status.json'
$startupFailureFile=Join-Path $root 'startup-failure.json'
$startupPortDiagnostic=$null
$openingEligible=$false
$launchRequestedAtUtc=$null
function Save-State([string]$state,[string]$failureStage='',[Nullable[int]]$engineExitCode=$null){
  $value=[ordered]@{atUtc=[datetime]::UtcNow.ToString('o');status=$state}
  if($failureStage){$value.failureStage=$failureStage}
  if($null -ne $engineExitCode){$value.engineExitCode=$engineExitCode}
  [IO.File]::WriteAllText($statusFile,($value|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
}
function Get-StartupFailureInfo($Failure,[string]$Stage){
  switch -CaseSensitive ($Failure.Exception.Message){
    'Another skin session is ending.' {return @{code='session-ending';reason='皮肤会话锁尚未释放。'}}
    'Diagnostic port occupied.' {return @{code='diagnostic-port-busy';reason='调试端口已被占用。'}}
    'Codex started concurrently.' {return @{code='client-started-concurrently';reason='启动期间检测到 Codex 已打开。'}}
    'Node.js runtime is unavailable.' {return @{code='node-unavailable';reason='未找到皮肤需要的 Node.js 运行环境。'}}
    'Exit normal Codex, then use the Xiaomu desktop entry.' {return @{code='listener-unavailable';reason='尚未找到可验证的 Codex 调试连接。'}}
    'Skin session stopped; inspect status.json.' {return @{code='engine-exited';reason='皮肤运行组件已异常结束。'}}
  }
  switch -CaseSensitive ($Stage){
    'session-lock' {return @{code='session-lock-failed';reason='未能建立皮肤会话锁。'}}
    'compatibility' {return @{code='compatibility-failed';reason='兼容检查未能完成。'}}
    'launch' {return @{code='launch-failed';reason='Codex 启动准备未能完成。'}}
    'listener-identity' {return @{code='listener-identity-failed';reason='未能确认 Codex 调试连接的身份。'}}
    'engine' {return @{code='engine-failed';reason='皮肤运行组件未能正常完成。'}}
    default {return @{code='startup-failed';reason='皮肤启动未能完成。'}}
  }
}
function Save-StartupFailure($Failure,[string]$Stage,[string]$Code){
  if($Stage -cnotin @('session-lock','compatibility','launch','listener-identity','engine')){$Stage='unknown'}
  $value=[ordered]@{schema=1;atUtc=[datetime]::UtcNow.ToString('o');mode=$Mode;failureStage=$Stage;errorCode=$Code;exceptionHResult=[int]$Failure.Exception.HResult;controllerPid=$PID}
  if($Code -ceq 'diagnostic-port-busy' -and $startupPortDiagnostic){$value['diagnosticPort']=$startupPortDiagnostic}
  [IO.File]::WriteAllText($startupFailureFile,($value|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
}
function Wait-StartupPort {
  $waitedMs=0
  while($true){
    if([IO.File]::Exists($stopFile)){return 'stopped'}
    if(@(Get-UiRows).Count -gt 0){return 'existing'}
    $listeners=@(Get-DreamSkinPortListeners -Port 9335)
    if($listeners.Count -eq 0){$script:startupPortDiagnostic=$null;return 'free'}
    $ownership='unavailable'
    try{$ownership=if(Test-DreamSkinCodexPortOwner -Port 9335 -Codex $codex -ExpectedSessionId $session){'codex'}else{'unverified'}}catch{}
    if($ownership -cne 'codex'){
      # The owner may have exited between the listener snapshot and its verification.
      $listeners=@(Get-DreamSkinPortListeners -Port 9335)
      if($listeners.Count -eq 0){$script:startupPortDiagnostic=$null;return 'free'}
    }
    $script:startupPortDiagnostic=[ordered]@{
      number=9335
      ownerPids=@($listeners|ForEach-Object {[int]$_.OwningProcess}|Sort-Object -Unique|Select-Object -First 8)
      ownership=$ownership
      waitedMs=$waitedMs
    }
    if($ownership -cne 'codex' -or $waitedMs -ge 3000){throw 'Diagnostic port occupied.'}
    # Only a verified same-installation, same-session Codex gets an exit grace period.
    Start-Sleep -Milliseconds 250
    $waitedMs+=250
  }
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
function Complete-PendingCompatibilityUpdate {
  $manifestPath=Join-Path $root 'manifest.json'
  $manifestBytes=[IO.File]::ReadAllBytes($manifestPath)
  if($manifestBytes.Length -gt 1048576){throw 'Pending update manifest is too large.'}
  $utf8=[Text.UTF8Encoding]::new($false,$true)
  $manifest=$utf8.GetString($manifestBytes)|ConvertFrom-Json
  $pending=$manifest.pendingCompatibilityUpdate
  if($null -eq $pending){return}
  $file='compatibility-contract.json'
  if(($pending.schema -isnot [int] -and $pending.schema -isnot [long]) -or $pending.schema -ne 1 -or $pending.file -cne $file -or
    $pending.previousSHA256 -isnot [string] -or $pending.previousSHA256 -cnotmatch '^[a-fA-F0-9]{64}$' -or
    $pending.newSHA256 -isnot [string] -or $pending.newSHA256 -cnotmatch '^[a-fA-F0-9]{64}$' -or
    $pending.contentBase64 -isnot [string] -or $pending.contentBase64.Length -gt 349528 -or
    $pending.contentBase64 -cnotmatch '^[A-Za-z0-9+/]+={0,2}$' -or @($manifest.files.PSObject.Properties).Count -ne 24 -or
    $manifest.files.$file -ine $pending.previousSHA256){throw 'Invalid pending compatibility update.'}
  $contractPath=Join-Path $root $file
  foreach($target in @($manifestPath,$contractPath)){
    if((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Pending update target is redirected.'}
  }
  function Get-PendingBytesHash([byte[]]$Bytes){
    $sha=[Security.Cryptography.SHA256]::Create()
    try{return [BitConverter]::ToString($sha.ComputeHash($Bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  }
  function Get-PendingFileHash([string]$Path){return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
  function Set-PendingFile([string]$Path,[byte[]]$Bytes,[string]$ExpectedHash){
    $temporary=Join-Path $root ('.pending-compatibility-'+[guid]::NewGuid().ToString('N')+'.tmp')
    try{
      [IO.File]::WriteAllBytes($temporary,$Bytes)
      if((Get-PendingFileHash $Path) -cne $ExpectedHash -or
        ((Get-Item -LiteralPath $Path).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Pending update target changed.'}
      [IO.File]::Replace($temporary,$Path,[NullString]::Value)
    }finally{if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
  }
  $newBytes=[Convert]::FromBase64String($pending.contentBase64)
  if($newBytes.Length -gt 262144 -or (Get-PendingBytesHash $newBytes) -ine $pending.newSHA256){throw 'Pending compatibility content hash mismatch.'}
  $contract=$utf8.GetString($newBytes)|ConvertFrom-Json
  if($contract -isnot [pscustomobject] -or ($contract.schema -isnot [int] -and $contract.schema -isnot [long]) -or
    $contract.schema -ne 1 -or $contract.features -isnot [pscustomobject]){throw 'Invalid pending compatibility JSON.'}
  if((Get-Item -LiteralPath $contractPath).Length -gt 262144){throw 'Current compatibility contract is too large.'}
  $oldBytes=[IO.File]::ReadAllBytes($contractPath)
  $oldHash=Get-PendingBytesHash $oldBytes
  if($oldHash -ine $pending.previousSHA256){throw 'Current compatibility contract changed.'}
  $oldManifestHash=Get-PendingBytesHash $manifestBytes
  $newHash=Get-PendingBytesHash $newBytes
  $manifest.files.$file=$newHash
  $manifest.PSObject.Properties.Remove('pendingCompatibilityUpdate')
  $newManifestBytes=$utf8.GetBytes(($manifest|ConvertTo-Json -Depth 20))
  $newManifestHash=Get-PendingBytesHash $newManifestBytes
  if((Get-PendingFileHash $manifestPath) -cne $oldManifestHash -or (Get-PendingFileHash $contractPath) -cne $oldHash){throw 'Pending update files changed.'}
  $backup=Join-Path $root ('pending-compatibility-backup-'+[guid]::NewGuid().ToString('N'))
  $null=New-Item -ItemType Directory -Path $backup
  [IO.File]::WriteAllBytes((Join-Path $backup 'manifest.json'),$manifestBytes)
  [IO.File]::WriteAllBytes((Join-Path $backup $file),$oldBytes)
  if((Get-PendingFileHash (Join-Path $backup 'manifest.json')) -cne $oldManifestHash -or
    (Get-PendingFileHash (Join-Path $backup $file)) -cne $oldHash){throw 'Pending compatibility backup verification failed.'}
  try{
    Set-PendingFile $contractPath $newBytes $oldHash
    Set-PendingFile $manifestPath $newManifestBytes $oldManifestHash
    Assert-PackageFiles
  }catch{
    $failure=$_
    $changed=$false
    foreach($entry in @(
      @{Path=$manifestPath;Old=$oldManifestHash;New=$newManifestHash;Bytes=$manifestBytes},
      @{Path=$contractPath;Old=$oldHash;New=$newHash;Bytes=$oldBytes}
    )){
      try{
        $current=Get-PendingFileHash $entry.Path
        if($current -ceq $entry.New){Set-PendingFile $entry.Path $entry.Bytes $entry.New}
        elseif($current -cne $entry.Old){$changed=$true}
      }catch{$changed=$true}
    }
    if($changed){throw 'Pending compatibility update failed; changed files were preserved and backups retained.'}
    throw $failure
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
  Complete-PendingCompatibilityUpdate
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
      $portState=Wait-StartupPort
      if($portState -ceq 'stopped'){Save-State 'disabled';return}
      if($portState -ceq 'free'){
        Start-Sleep -Milliseconds 300
        if([IO.File]::Exists($stopFile)){Save-State 'disabled';return}
        if(@(Get-UiRows).Count -eq 0){
          $launchRequestedAtUtc=[datetime]::UtcNow.ToString('o')
          $null=Start-DreamSkinCodex -Codex $codex -Arguments @('--remote-debugging-address=127.0.0.1','--remote-debugging-port=9335')
          $openingEligible=$true
        }
      }
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
  $failure=$_
  $failureInfo=Get-StartupFailureInfo $failure $failureStage
  $failureSaved=$false
  try{Save-StartupFailure $failure $failureStage $failureInfo.code;$failureSaved=$true}catch{}
  if($lock){try{Save-State 'stopped-check-required' $failureStage $engineExitCode}catch{}}
  if($lock){$lock.Dispose();$lock=$null}
  if($maintenance){Exit-XiaomuMaintenance $maintenance;$maintenance=$null}
  if($Mode -eq 'Start'){
    Add-Type -AssemblyName System.Windows.Forms
    $receiptNote=if($failureSaved){'失败信息已保存在安装目录 startup-failure.json。'}else{'失败信息未能写入安装目录 startup-failure.json。'}
    $null=[Windows.Forms.MessageBox]::Show(("小睦皮肤未能启动（$($failureInfo.code)）。`r`n$($failureInfo.reason)`r`n$receiptNote"),'小睦 Codex')
  }
  exit 1
}finally{
  if($lock){$lock.Dispose();$lock=$null}
  if($maintenance){Exit-XiaomuMaintenance $maintenance;$maintenance=$null}
}

[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$ArchivePath,
  [Parameter(Mandatory=$true)][string]$ReportDirectory
)
$ErrorActionPreference='Stop'
# This harness installs into the disposable runner user's real profile. Never run on a developer PC.
if($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:RUNNER_OS -cne 'Windows'){
  throw 'This acceptance harness requires a disposable GitHub-hosted Windows runner.'
}
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$OutputEncoding=[Console]::OutputEncoding
$expectedZip='96504fb0cf2e381fbd969eb63849b888114a7258ea0c601b77f3e093c3fa082f'
$expectedManifest='125f1e7d8f3410c9aa5db958e2127e1affd76db13e7adbcd9792e81e6349b523'
$checks=New-Object 'System.Collections.Generic.List[string]'
$stage='hosted runner baseline'
$failureType=''
$failureLine=0
$failureMessage=''
$failureScript=''
$failureStack=''
$failureFile=''
$technicalPassed=$false
$dependencies=$null
$officialCodexPresent=$null
$os=Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$elevated=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$workspace=Join-Path $env:RUNNER_TEMP ('xiaomu-release-'+[guid]::NewGuid().ToString('N'))
$installParent=Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin'
$installed=Join-Path $installParent '1.0.0'
function Check($condition,[string]$name){
  $script:stage=$name
  if(-not $condition){throw ('Acceptance failed: '+$name)}
  $script:checks.Add($name)
  Write-Output ('PASS '+$name)
}
function Hash([string]$path){return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Sanitize-Diagnostic([string]$text){
  $prefixes=@('RUNNER_TEMP','USERPROFILE','LOCALAPPDATA','GITHUB_WORKSPACE')|ForEach-Object{
    $value=[Environment]::GetEnvironmentVariable($_)
    if($value){[pscustomobject]@{name=$_;value=$value}}
  }|Sort-Object @{Expression={$_.value.Length};Descending=$true}
  foreach($prefix in $prefixes){
    $text=[regex]::Replace($text,[regex]::Escape($prefix.value),('<'+$prefix.name+'>'),[Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }
  if($text.Length -gt 8000){$text=$text.Substring(0,8000)+' [truncated]'}
  return $text
}
function Snapshot([string]$root){
  $map=@{}
  foreach($file in @(Get-ChildItem -LiteralPath $root -File -Recurse)){
    $map[$file.FullName.Substring($root.TrimEnd('\').Length+1)]=Hash $file.FullName
  }
  return $map
}
function Same-Snapshot($before,[string]$root){
  $after=Snapshot $root
  return $before.Count -eq $after.Count -and @($before.Keys|Where-Object{$after[$_] -cne $before[$_]}).Count -eq 0
}
function Control([string]$operation,[bool]$expectSuccess=$true){
  $script:stage='control action '+$operation
  $ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $output=& $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $script:releasePackage 'control-actions.ps1') -Action $operation -PackageRoot $script:releasePackage
  $code=$LASTEXITCODE
  $result=($output -join [Environment]::NewLine)|ConvertFrom-Json
  if(($expectSuccess -and ($code -ne 0 -or -not $result.ok)) -or (-not $expectSuccess -and ($code -eq 0 -or $result.ok))){
    throw ('Unexpected result for control action '+$operation)
  }
  return $result
}
try{
  Check (-not (Test-Path -LiteralPath $installParent)) 'no prior default Xiaomu installation or repair backup'
  $codexRegistration=@(Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop)
  $officialCodexPresent=$codexRegistration.Count -gt 0
  Check ($codexRegistration.Count -eq 0 -and @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue).Count -eq 0) 'no official Codex registration or running ChatGPT process'
  Check ((Hash $ArchivePath) -ceq $expectedZip) 'public RC1 ZIP matches the pinned SHA256'
  $null=New-Item -ItemType Directory -Path $workspace
  $expanded=Join-Path $workspace 'downloaded-package'
  Expand-Archive -LiteralPath $ArchivePath -DestinationPath $expanded
  $script:releasePackage=Join-Path $expanded 'skin'
  Check ((Hash (Join-Path $releasePackage 'manifest.json')) -ceq $expectedManifest) 'downloaded runtime manifest matches RC1'
  $downloadSnapshot=Snapshot $expanded
  . (Join-Path $releasePackage 'control-actions.ps1') -Action Functions
  $manifest=Test-ControlPackage $releasePackage
  Check (@($manifest.files.PSObject.Properties).Count -eq 24) 'all 24 runtime files verify before installation'
  $dependencies=Get-ControlDependencies
  Check (-not $dependencies.ready -and $dependencies.codexVersion -eq '' -and $dependencies.issues.Count -gt 0) 'actual missing Codex dependency is reported without a readiness mock'
  $missingNode=Get-ControlDependencies (Join-Path $workspace 'absent-node.exe')
  Check (-not $missingNode.ready -and $missingNode.nodeVersion -eq '' -and $missingNode.issues.Count -ge 2) 'missing Node and missing Codex produce dependency guidance'

  $desktop=[Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop,[Environment+SpecialFolderOption]::Create)
  Check ([bool]$desktop -and (Test-Path -LiteralPath $desktop -PathType Container)) 'runner user real Desktop is available'
  $desktopBefore=Snapshot $desktop
  $stage='install into default profile and Desktop'
  & (Join-Path $releasePackage 'install.ps1') -SourceRoot $releasePackage | Out-Null
  $installedManifest=Test-ControlPackage $installed
  Check ((Hash (Join-Path $installed 'manifest.json')) -ceq $expectedManifest -and @($installedManifest.files.PSObject.Properties).Count -eq 24) 'default profile install contains all 24 exact RC1 files'
  $receipt=Get-Content -LiteralPath (Join-Path $installParent 'installation.json') -Raw -Encoding utf8|ConvertFrom-Json
  $shell=New-Object -ComObject WScript.Shell
  $dedicated=@($receipt.shortcuts)
  $linksMatch=$dedicated.Count -eq 3
  foreach($path in $dedicated){
    $link=$shell.CreateShortcut($path)
    $linksMatch=$linksMatch -and (Split-Path $path -Parent) -ieq $desktop -and $link.TargetPath -ieq (Join-Path $env:SystemRoot 'System32\wscript.exe') -and $link.Arguments.StartsWith('"'+$installed+'\') -and $link.WorkingDirectory -ieq $installed
  }
  Check ($linksMatch -and (Snapshot $desktop).Count -eq ($desktopBefore.Count+3)) 'three real dedicated Desktop shortcuts read back correctly'
  $shortcutHashes=@{};foreach($path in $dedicated){$shortcutHashes[$path]=Hash $path}
  & (Join-Path $releasePackage 'install.ps1') -SourceRoot $releasePackage | Out-Null
  Check (@($shortcutHashes.Keys|Where-Object{(Hash $_) -cne $shortcutHashes[$_]}).Count -eq 0) 'repeat default installation preserves shortcut bytes'
  $inspect=Control 'Inspect'
  Check ($inspect.installed -and $inspect.integrity -ceq 'verified' -and -not $inspect.dependencies.ready) 'real manager inspection reports installed files and missing dependencies'
  $start=Control 'Start' $false
  Check (-not $start.ok -and [bool]$start.message -and @(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue).Count -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $installed 'status.json'))) 'Start refuses missing Codex without launching a substitute'
  $pause=Control 'Pause'
  Check ($pause.runtime -ceq 'paused' -and (Test-Path -LiteralPath (Join-Path $installed 'stop.flag'))) 'Pause works without Codex or ready dependencies'
  $restore=Control 'Restore'
  Check ($restore.runtime -ceq 'restored' -and @($dedicated|Where-Object{-not (Test-Path -LiteralPath $_)}).Count -eq 0) 'Restore works without Codex and retains dedicated management shortcuts'
  $again=Control 'Restore'
  Check ($again.runtime -ceq 'restored') 'repeating Restore is harmless'

  # These are real COM shortcut files in synthetic roots, not an official Codex GUI launch.
  $fixture=Join-Path $workspace 'synthetic-shortcuts'
  $roots=@('Desktop','Programs','Taskbar')|ForEach-Object{Join-Path $fixture $_}
  foreach($root in $roots){$null=New-Item -ItemType Directory -Path $root -Force}
  $fakeExecutable=Join-Path $fixture 'ChatGPT.exe'
  [IO.File]::WriteAllText($fakeExecutable,'Synthetic shortcut target; never executed.')
  $officialFixture=Join-Path $roots[0] 'Fixture Codex.lnk'
  $link=$shell.CreateShortcut($officialFixture);$link.TargetPath=$fakeExecutable;$link.Save()
  $originalShortcutHash=Hash $officialFixture
  . (Join-Path $releasePackage 'entrypoints.ps1') -Mode Functions
  $applied=Sync-XiaomuEntrypoints $installed $roots $fakeExecutable 'Apply'
  Check ($applied.changed -eq 3 -and (Hash $officialFixture) -cne $originalShortcutHash) 'synthetic COM shortcut roots apply with real backup files'
  $entryReceiptHash=Hash (Join-Path $installed 'entrypoints.json')
  $null=Control 'Pause'
  [IO.File]::AppendAllText((Join-Path $installed 'skin.js'),'RC1 acceptance corruption sentinel')
  $sentinel=Join-Path $workspace 'damaged-manager-executed.txt'
  [IO.File]::WriteAllText((Join-Path $installed 'manager.ps1'),('[IO.File]::WriteAllText('''+$sentinel.Replace("'","''")+''',''BAD'');throw ''Damaged manager must not execute'''))
  $oldFiles=Snapshot $installed
  $damaged=Control 'Inspect'
  Check ($damaged.integrity -ceq 'damaged') 'real inspection detects installed file corruption'
  $repair=Control 'Install'
  $repairReceipt=Get-Content -LiteralPath (Join-Path $installParent 'installation.json') -Raw -Encoding utf8|ConvertFrom-Json
  Check ($repair.integrity -ceq 'verified' -and $repair.runtime -ceq 'paused' -and -not (Test-Path -LiteralPath $sentinel)) 'trusted-source repair restores integrity, stays paused and avoids damaged manager'
  Check ([bool]$repairReceipt.repairBackup -and (Same-Snapshot $oldFiles $repairReceipt.repairBackup)) 'repair retains every old installed file byte in its backup'
  Check ((Hash (Join-Path $installed 'entrypoints.json')) -ceq $entryReceiptHash) 'repair retains exact synthetic shortcut recovery receipts'
  $stage='installed restore wrapper with synthetic shortcut roots'
  & (Join-Path $installed 'restore.ps1') -ShortcutRoots $roots | Out-Null
  $entryState=Get-Content -LiteralPath (Join-Path $installed 'entrypoints.json') -Raw -Encoding utf8|ConvertFrom-Json
  Check ((Hash $officialFixture) -ceq $originalShortcutHash -and @($entryState.entries).Count -eq 0 -and -not (Test-Path -LiteralPath (Join-Path $roots[0] 'Codex.lnk')) -and -not (Test-Path -LiteralPath (Join-Path $roots[1] 'Codex.lnk'))) 'installed restore wrapper restores synthetic shortcut bytes and removes only its created links'
  $final=Control 'Restore'
  Check ($final.runtime -ceq 'restored' -and $final.integrity -ceq 'verified') 'default manager restore remains usable after repair'
  Check (Same-Snapshot $downloadSnapshot $expanded) 'all extracted download files remain unchanged'
  Check (@($shortcutHashes.Keys|Where-Object{(Hash $_) -cne $shortcutHashes[$_]}).Count -eq 0 -and @($desktopBefore.Keys|Where-Object{-not (Test-Path -LiteralPath (Join-Path $desktop $_)) -or (Hash (Join-Path $desktop $_)) -cne $desktopBefore[$_]}).Count -eq 0) 'dedicated shortcuts and pre-existing runner Desktop files are preserved'
  Check (@(Get-Process -Name ChatGPT -ErrorAction SilentlyContinue).Count -eq 0) 'no ChatGPT process was created during acceptance'
  $technicalPassed=$true
}catch{
  $failureType=$_.Exception.GetType().Name
  $failureLine=$_.InvocationInfo.ScriptLineNumber
  $failureMessage=Sanitize-Diagnostic $_.Exception.Message
  $failureScript=[IO.Path]::GetFileName($_.InvocationInfo.ScriptName)
  $failureStack=Sanitize-Diagnostic $_.ScriptStackTrace
  if($_.Exception.PSObject.Properties['FileName'] -and $_.Exception.FileName){$failureFile=[IO.Path]::GetFileName($_.Exception.FileName)}
  Write-Output ('FAIL '+$stage+' ('+$failureType+')')
  Write-Output ('Failure source: '+$failureScript+':'+$failureLine)
  Write-Output ('Failure message: '+$failureMessage)
  if($failureFile){Write-Output ('Failure file basename: '+$failureFile)}
  if($failureStack){Write-Output ('Failure stack: '+$failureStack)}
}finally{
  $skipped=@(
    'Positive official Store Codex startup and skin rendering: no Store Codex registration in this Server runner.',
    'Ordinary non-administrator desktop user acceptance: hosted runner identity is recorded, not replaced.',
    'Windows 11 desktop visuals, login, image controls, Enter flash, opening skip and Esc.',
    'Browser download mark, SmartScreen/security prompts and unsigned-EXE interaction.',
    'System reboot and subsequent automatic skin loading.'
  )
  $report=[ordered]@{
    candidate='20261031-3384-rc1';zipSha256=$expectedZip;manifestSha256=$expectedManifest
    technicalChecksPassed=$technicalPassed;passed=$checks.Count;checks=$checks.ToArray()
    environment=[ordered]@{runner='GitHub-hosted Windows';osEdition=[string]$os.EditionID;osBuild=[string]$os.CurrentBuild;elevated=$elevated;freshSkinBaseline=$checks.Contains('no prior default Xiaomu installation or repair backup')}
    dependencies=[ordered]@{ready=$(if($null -ne $dependencies){$dependencies.ready}else{$null});nodeVersion=$(if($null -ne $dependencies){$dependencies.nodeVersion}else{''});officialCodexPresent=$officialCodexPresent}
    independentDesktopWindowsVerified=$false;officialCodexLaunched=$false;visualReviewRequired=$true
    skipped=$skipped;failedStage=$(if(-not $technicalPassed){$stage}else{''});failureType=$failureType;failureLine=$failureLine
    failureMessage=$failureMessage;failureScript=$failureScript;failureStack=$failureStack;failureFileBasename=$failureFile;atUtc=[datetime]::UtcNow.ToString('o')
  }
  $null=New-Item -ItemType Directory -Path $ReportDirectory -Force
  [IO.File]::WriteAllText((Join-Path $ReportDirectory 'report.json'),($report|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
  $lines=@('# Independent Windows Server RC1 acceptance','',('Technical checks passed: '+$technicalPassed),('Passed checks: '+$checks.Count),('OS edition: '+$os.EditionID+'; build: '+$os.CurrentBuild+'; elevated: '+$elevated),'','## Passed checks','')+@($checks|ForEach-Object{'- '+$_})+@('','## Not verified','')+@($skipped|ForEach-Object{'- '+$_})
  if(-not $technicalPassed){$lines+=@('',('Failed stage: '+$stage+' ('+$failureType+'; '+$failureScript+':'+$failureLine+')'),('Message: '+$failureMessage),('File basename: '+$failureFile),'','```text',$failureStack,'```')}
  [IO.File]::WriteAllText((Join-Path $ReportDirectory 'summary.md'),($lines -join [Environment]::NewLine),[Text.UTF8Encoding]::new($false))
}
if(-not $technicalPassed){exit 1}
exit 0

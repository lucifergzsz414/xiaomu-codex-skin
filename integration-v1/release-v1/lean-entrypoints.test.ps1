$ErrorActionPreference='Stop'
$root=Join-Path $PSScriptRoot ('test-output\lean-entrypoints-'+[guid]::NewGuid().ToString('N'))
$source=Join-Path $root 'package'
$desktop=Join-Path $root 'Desktop'
$programs=Join-Path $root 'Programs'
$taskbar=Join-Path $root 'Taskbar'
$installParent=Join-Path $root 'installed'
$destination=Join-Path $installParent '1.0.0'
$null=New-Item -ItemType Directory -Path $source,$desktop,$programs,$taskbar -Force

function Assert-Pass($Condition,[string]$Label) {
  if(-not $Condition){throw $Label}
  Write-Output ('PASS '+$Label)
}
function Get-Hash([string]$File) {
  return (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash
}
function New-Link([string]$Path,[string]$Target,[string]$Arguments='',[string]$Description='fixture') {
  $link=$shell.CreateShortcut($Path)
  $link.TargetPath=$Target
  $link.Arguments=$Arguments
  $link.Description=$Description
  $link.Save()
}
$files=[ordered]@{}
$runtime=@('maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js','launch.vbs','restore.vbs','xiaomu.ico')
foreach($name in $runtime){
  $target=Join-Path $source $name
  if($name -in @('maintenance.ps1','install.ps1','entrypoints.ps1')){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $target
  }else{
    [IO.File]::WriteAllText($target,'isolated fixture, never execute')
  }
  $files[$name]=Get-Hash $target
}
[IO.File]::WriteAllText((Join-Path $source 'manifest.json'),(@{id='xiaomu-codex-skin';version='1.0.0';files=$files}|ConvertTo-Json -Depth 4))

$installer=Join-Path $source 'install.ps1'
$installArgs=@{SourceRoot=$source;InstallParent=$installParent;ShortcutDirectory=$desktop;ManagementShortcutDirectory=$programs}
$receipt=(& $installer @installArgs)|ConvertFrom-Json
. (Join-Path $source 'entrypoints.ps1') -Mode Functions
$shell=New-XiaomuShortcutShell
$launcher=Join-Path $desktop '小睦 Codex.lnk'
$management=Join-Path $programs '小睦皮肤管理.lnk'
$legacyRestore=Join-Path $desktop '恢复 Codex 原样.lnk'
$scriptHost=Join-Path $env:SystemRoot 'System32\wscript.exe'
$launchArgs='"'+(Join-Path $destination 'launch.vbs')+'"'
$manageArgs='"'+(Join-Path $destination 'manage.vbs')+'"'
$roots=@($desktop,$programs,$taskbar)
Assert-Pass (@($receipt.shortcuts).Count -eq 2 -and @($receipt.shortcuts)[0] -ieq $launcher -and @($receipt.shortcuts)[1] -ieq $management -and @((Get-ChildItem -LiteralPath $desktop -Filter '*.lnk')).Count -eq 1 -and @((Get-ChildItem -LiteralPath $programs -Filter '*.lnk')).Count -eq 1) 'fresh install creates one Desktop launcher and one Programs manager'
$launcherLink=$shell.CreateShortcut($launcher)
$managementLink=$shell.CreateShortcut($management)
Assert-Pass ($launcherLink.TargetPath -ieq $scriptHost -and $launcherLink.Arguments -ceq $launchArgs -and $managementLink.TargetPath -ieq $scriptHost -and $managementLink.Arguments -ceq $manageArgs) 'both shortcuts round-trip with exact destinations and arguments'
$launchHash=Get-Hash $launcher
$manageHash=Get-Hash $management
& $installer @installArgs | Out-Null
Assert-Pass ((Get-Hash $launcher) -ceq $launchHash -and (Get-Hash $management) -ceq $manageHash) 'repeat installation preserves shortcut bytes'
$blockedPrograms=Join-Path $root 'Programs-occupied-by-file'
[IO.File]::WriteAllText($blockedPrograms,'test fixture, preserve')
$blockedHash=Get-Hash $blockedPrograms
$manifestPath=Join-Path $destination 'manifest.json'
$manifestHash=Get-Hash $manifestPath
$blocked=$false
try{& $installer -SourceRoot $source -InstallParent $installParent -ShortcutDirectory $desktop -ManagementShortcutDirectory $blockedPrograms -Repair | Out-Null}
catch{$blocked=$_.Exception.Message -ceq 'Management shortcut path must be a directory.'}
Assert-Pass ($blocked -and (Get-Hash $blockedPrograms) -ceq $blockedHash -and (Get-Hash $manifestPath) -ceq $manifestHash -and @(Get-ChildItem -LiteralPath $installParent -Filter 'backup-repair-*').Count -eq 0) 'a file in the Programs path blocks repair before replacing the installation'
$isolatedParent=Join-Path $root 'isolated-fallback'
$fallback=(& $installer -SourceRoot $source -InstallParent $isolatedParent)|ConvertFrom-Json
Assert-Pass ($fallback.shortcuts[0] -ieq (Join-Path $isolatedParent 'Desktop\小睦 Codex.lnk') -and $fallback.shortcuts[1] -ieq (Join-Path $isolatedParent 'Programs\小睦皮肤管理.lnk')) 'install parent override isolates both shortcut locations'

$fakeExe=Join-Path $root 'ChatGPT.exe'
[IO.File]::WriteAllText($fakeExe,'synthetic target, never execute')
$official=Join-Path $desktop 'Existing Codex.lnk'
New-Link $official $fakeExe
$officialHash=Get-Hash $official
$genericDesktop=Join-Path $desktop 'Codex.lnk'
$genericPrograms=Join-Path $programs 'Codex.lnk'
$sync=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
Assert-Pass ($sync.changed -eq 1 -and -not (Test-Path -LiteralPath $genericDesktop) -and -not (Test-Path -LiteralPath $genericPrograms)) 'Apply redirects only the existing Codex link'
Assert-Pass (($shell.CreateShortcut($official)).Arguments -ceq $launchArgs -and (Get-Hash $official) -cne $officialHash) 'the existing shortcut is actually redirected'
$sync=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
Assert-Pass ($sync.changed -eq 0) 'repeated Apply does not create any shortcuts'

# Simulate the old installer and automatic generic links with real Unicode shortcuts.
New-Link $legacyRestore $scriptHost ('"'+(Join-Path $destination 'restore.vbs')+'"')
$legacyRestoreHash=Get-Hash $legacyRestore
New-Link $genericDesktop $scriptHost $launchArgs 'Xiaomu legacy automatic Desktop'
New-Link $genericPrograms $scriptHost $launchArgs 'Xiaomu legacy automatic Programs'
$genericHash=Get-Hash $genericDesktop
$genericProgramBefore=Get-Hash $genericPrograms
$statePath=Join-Path $destination 'entrypoints.json'
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8 | ConvertFrom-Json
$state.entries=@($state.entries)+@(
  @{path=$genericDesktop;created=$true;backup='';originalSha256='';installedSha256=$genericHash},
  @{path=$genericPrograms;created=$true;backup='';originalSha256='';installedSha256=$genericProgramBefore}
)
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
New-Link $genericPrograms $scriptHost $launchArgs 'User customised this shortcut'
$editedHash=Get-Hash $genericPrograms
Assert-Pass ($editedHash -cne $genericProgramBefore) 'edited legacy link fixture actually changed'
$beforeInspect=Get-Hash $statePath
$null=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Inspect'
Assert-Pass ((Get-Hash $statePath) -ceq $beforeInspect -and (Get-Hash $genericDesktop) -ceq $genericHash) 'Inspect does not touch legacy receipts or shortcuts'
& $installer @installArgs -Repair | Out-Null
Assert-Pass ((Get-Hash $legacyRestore) -ceq $legacyRestoreHash -and (Get-Hash $launcher) -ceq $launchHash -and (Get-Hash $management) -ceq $manageHash -and (Get-Hash $statePath) -ceq $beforeInspect) 'repair preserves old dedicated shortcuts, new shortcuts and recovery receipt'
$sync=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8 | ConvertFrom-Json
$archived=@($state.retired|Where-Object {$_.path -ieq $genericDesktop})
Assert-Pass ($sync.retired -eq 1 -and -not (Test-Path -LiteralPath $genericDesktop) -and $archived.Count -eq 1 -and (Get-Hash (Join-Path (Join-Path $destination 'entrypoint-backups') $archived[0].backup)) -ceq $genericHash) 'exact legacy duplicate is retired only with an exact archived backup'
Assert-Pass ((Get-Hash $genericPrograms) -ceq $editedHash -and (Get-Hash $legacyRestore) -ceq $legacyRestoreHash) 'edited generic and unverified dedicated shortcuts remain intact'
$sync=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
Assert-Pass ($sync.retired -eq 0 -and $sync.changed -eq 0) 'repeated Apply never recreates a retired alias'
$sync=Sync-XiaomuEntrypoints $destination $roots '' 'Restore'
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8 | ConvertFrom-Json
Assert-Pass ($sync.changed -eq 1 -and (Get-Hash $official) -ceq $officialHash -and (Get-Hash $genericPrograms) -ceq $editedHash -and @($state.retired).Count -eq 1) 'Restore recovers original bytes and preserves changed/archived shortcuts'
# A receipt with a matching hash still cannot retire an unrelated target.
New-Link $genericDesktop $fakeExe '' 'Unrelated target with a matching legacy hash'
$wrongTargetHash=Get-Hash $genericDesktop
$state.entries=@($state.entries)+@{path=$genericDesktop;created=$true;backup='';originalSha256='';installedSha256=$wrongTargetHash}
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$sync=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
Assert-Pass ($sync.retired -eq 0 -and (Get-Hash $genericDesktop) -ceq $wrongTargetHash) 'Apply preserves a legacy entry with a matching hash but wrong target'
$sync=Sync-XiaomuEntrypoints $destination $roots '' 'Restore'
Assert-Pass ($sync.retired -eq 0 -and (Get-Hash $genericDesktop) -ceq $wrongTargetHash -and (Get-Hash $official) -ceq $officialHash) 'Restore also preserves a legacy entry with a wrong target'

# Do not retire a generic link if its receipt also claims to hold original bytes.
New-Link $genericDesktop $scriptHost $launchArgs 'Receipt with inconsistent creation and backup state'
$inconsistentHash=Get-Hash $genericDesktop
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json
$state.entries=@($state.entries|Where-Object{$_.path -ine $genericDesktop})+@{path=$genericDesktop;created=$true;backup=('a'*32+'.lnk');originalSha256=('B'*64);installedSha256=$inconsistentHash}
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$applied=Sync-XiaomuEntrypoints $destination $roots $fakeExe 'Apply'
$restored=Sync-XiaomuEntrypoints $destination $roots '' 'Restore'
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json
$retained=@($state.entries|Where-Object {$_.path -ieq $genericDesktop})
Assert-Pass ($applied.retired -eq 0 -and $restored.retired -eq 0 -and (Get-Hash $genericDesktop) -ceq $inconsistentHash -and $retained.Count -eq 1 -and $retained[0].originalSha256 -ceq ('B'*64)) 'inconsistent created receipts retain the original-backup association and shortcut'

# Restore can archive an authentic legacy alias before any successful Apply.
New-Link $genericPrograms $scriptHost $launchArgs 'Xiaomu legacy automatic Programs'
$restoreHash=Get-Hash $genericPrograms
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json
$state.entries=@($state.entries|Where-Object{$_.path -ine $genericPrograms})+@{path=$genericPrograms;created=$true;backup='';originalSha256='';installedSha256=$restoreHash}
[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$sync=Sync-XiaomuEntrypoints $destination $roots '' 'Restore'
$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json
$archived=@($state.retired|Where-Object{$_.path -ieq $genericPrograms})
Assert-Pass ($sync.retired -eq 1 -and -not (Test-Path -LiteralPath $genericPrograms) -and $archived.Count -eq 1 -and (Get-Hash (Join-Path (Join-Path $destination 'entrypoint-backups') $archived[0].backup)) -ceq $restoreHash) 'Restore archives an exact legacy alias before retiring it'
Write-Output 'Isolated shortcut checks complete. Fixtures retained in test-output.'

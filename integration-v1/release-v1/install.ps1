param([string]$SourceRoot='', [string]$InstallParent='', [string]$ShortcutDirectory='', [switch]$Repair, [string]$ManagementShortcutDirectory='')
$ErrorActionPreference='Stop'
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$source=if($SourceRoot){[IO.Path]::GetFullPath($SourceRoot)}elseif(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'manifest.json')){$PSScriptRoot}else{Join-Path $PSScriptRoot 'package'}
$parent=if($InstallParent){[IO.Path]::GetFullPath($InstallParent)}else{Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin'}
$desktop=if($ShortcutDirectory){[IO.Path]::GetFullPath($ShortcutDirectory)}elseif($InstallParent){Join-Path $parent 'Desktop'}else{[Environment]::GetFolderPath('Desktop')}
$programs=if($ManagementShortcutDirectory){[IO.Path]::GetFullPath($ManagementShortcutDirectory)}
  elseif($InstallParent){Join-Path $parent 'Programs'}
  elseif($ShortcutDirectory){Join-Path $desktop 'Programs'}
  else{[Environment]::GetFolderPath([Environment+SpecialFolder]::Programs,[Environment+SpecialFolderOption]::DoNotVerify)}
if(-not $desktop -or -not $programs -or $desktop.TrimEnd('\') -ieq $programs.TrimEnd('\')){throw 'Desktop and management shortcut directories must be distinct.'}
if(($ShortcutDirectory -or -not $InstallParent) -and -not (Test-Path -LiteralPath $desktop -PathType Container)){throw 'Shortcut directory must already exist.'}
if((Test-Path -LiteralPath $programs) -and -not (Test-Path -LiteralPath $programs -PathType Container)){throw 'Management shortcut path must be a directory.'}
$destination=Join-Path $parent '1.0.0'
if(Test-Path -LiteralPath $parent){if(((Get-Item -LiteralPath $parent).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Install parent cannot be a reparse point.'}}
if(Test-Path -LiteralPath $destination){
  if(((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Install directory cannot be a reparse point.'}
  # Re-running completes shortcuts without overwriting an installed release.
  if(-not $Repair){$source=$destination}
}
if($Repair -and $source.TrimEnd('\') -ieq $destination.TrimEnd('\')){throw 'Repair requires a separate intact package.'}
foreach($path in @($source,$parent,$desktop,$programs)){
  $cursor=[IO.Path]::GetFullPath($path)
  while($cursor){if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Install paths cannot traverse links.'};$cursor=Split-Path $cursor -Parent}
}
$manifest=Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding utf8|ConvertFrom-Json
if($manifest.id -cne 'xiaomu-codex-skin' -or $manifest.version -cne '1.0.0'){throw 'Unexpected install package.'}
$names=@($manifest.files.PSObject.Properties.Name)+@('manifest.json')
foreach($required in @('maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js')){if($required -notin $manifest.files.PSObject.Properties.Name){throw 'Incomplete install manifest.'}}
foreach($name in $names){if($name -notmatch '^[A-Za-z0-9._-]+$'){throw 'Invalid install entry.'}}
foreach($property in $manifest.files.PSObject.Properties){
  $file=Get-Item -LiteralPath (Join-Path $source $property.Name)
  if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Package files cannot be links.'}
  if((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ine $property.Value){throw 'Package file verification failed.'}
}
. (Join-Path $source 'maintenance.ps1')
$maintenance=Enter-XiaomuMaintenance $destination
try{
. (Join-Path $source 'entrypoints.ps1') -Mode Functions
$shell=New-XiaomuShortcutShell
$scriptHost=Join-Path $env:SystemRoot 'System32\wscript.exe'
$entries=@(
  @{Path=(Join-Path $desktop '小睦 Codex.lnk');Directory=$desktop;Script='launch.vbs'},
  @{Path=(Join-Path $programs '小睦皮肤管理.lnk');Directory=$programs;Script='manage.vbs'}
)
foreach($entry in $entries){
  if(-not (Test-XiaomuEntryPath $entry.Path @($entry.Directory))){throw 'Invalid dedicated shortcut path.'}
  if(Test-Path -LiteralPath $entry.Path){
    $existing=$shell.CreateShortcut($entry.Path)
    $expectedArgs='"'+(Join-Path $destination $entry.Script)+'"'
    if($existing.TargetPath -ine $scriptHost -or $existing.Arguments -cne $expectedArgs){throw ('快捷方式名称已被其他入口占用，未覆盖：'+$entry.Path)}
  }
}
if($Repair -and (Test-Path -LiteralPath $destination)){
  $lockPath=Join-Path $destination 'session.lock'
  if((Test-Path -LiteralPath $lockPath) -and ((Get-Item -LiteralPath $lockPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid session lock.'}
  $handle=$null
  try{$handle=[IO.File]::Open($lockPath,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch{throw 'Pause the skin before repairing. No process was killed.'}finally{if($handle){$handle.Dispose()}}
}
if($Repair -or -not (Test-Path -LiteralPath $destination)){
  $staging=Join-Path $parent ('pending-'+[guid]::NewGuid().ToString('N'))
  $null=New-Item -ItemType Directory -Path $staging -Force
  try{
    foreach($name in $names){Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $staging $name)}
    foreach($property in $manifest.files.PSObject.Properties){if((Get-FileHash -LiteralPath (Join-Path $staging $property.Name) -Algorithm SHA256).Hash -ine $property.Value){throw 'Staged bytes differ from package.'}}
    $base=[IO.Path]::GetFullPath($parent).TrimEnd('\')+'\'
    if(-not [IO.Path]::GetFullPath($staging).StartsWith($base,[StringComparison]::OrdinalIgnoreCase) -or -not [IO.Path]::GetFullPath($destination).StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){throw 'Invalid install destination.'}
    $backup=''
    if($Repair -and (Test-Path -LiteralPath $destination)){
      foreach($name in @('entrypoints.json','control-state.json')){
        $statePath=Join-Path $destination $name
        if(Test-Path -LiteralPath $statePath){if(((Get-Item -LiteralPath $statePath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid recovery record.'};Copy-Item -LiteralPath $statePath -Destination (Join-Path $staging $name)}
      }
      $oldBackups=Join-Path $destination 'entrypoint-backups'
      if(Test-Path -LiteralPath $oldBackups){
        if(((Get-Item -LiteralPath $oldBackups).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid recovery backups.'}
        $newBackups=Join-Path $staging 'entrypoint-backups';$null=New-Item -ItemType Directory -Path $newBackups
        foreach($file in @(Get-ChildItem -LiteralPath $oldBackups -Force)){
          if($file.PSIsContainer -or $file.Name -cnotmatch '^[a-f0-9]{32}\.lnk$' -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid recovery backup entry.'}
          Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $newBackups $file.Name)
        }
      }
      [IO.File]::WriteAllText((Join-Path $staging 'stop.flag'),'stop')
      $backup=Join-Path $parent ('backup-repair-'+[guid]::NewGuid().ToString('N'))
      [IO.Directory]::Move($destination,$backup)
    }
    try{[IO.Directory]::Move($staging,$destination)}catch{if($backup -and -not (Test-Path -LiteralPath $destination)){[IO.Directory]::Move($backup,$destination)};throw}
  }catch{throw ('安装未完成。目标：'+$destination+'；旧目录备份：'+$backup+'；暂存：'+$staging+'。'+$_.Exception.Message)}
}
$links=@()
foreach($entry in $entries){
  $linkPath=$entry.Path
  if(-not (Test-XiaomuEntryPath $linkPath @($entry.Directory))){throw 'Invalid dedicated shortcut path.'}
  if(-not (Test-Path -LiteralPath $entry.Directory -PathType Container)){
    $null=New-Item -ItemType Directory -Path $entry.Directory -Force
  }
  $expectedArgs='"'+(Join-Path $destination $entry.Script)+'"'
  $link=$shell.CreateShortcut($linkPath)
  if(Test-Path -LiteralPath $linkPath){
    if($link.TargetPath -ine $scriptHost -or $link.Arguments -cne $expectedArgs){throw ('快捷方式名称已被其他入口占用，未覆盖：'+$linkPath)}
  }else{
    $link.TargetPath=$scriptHost
    $link.Arguments=$expectedArgs
    $link.WorkingDirectory=$destination
    $link.IconLocation=(Join-Path $destination 'xiaomu.ico')+',0'
    $link.Description='Xiaomu Codex skin - separate reversible user launcher'
    $link.Save()
    $readback=$shell.CreateShortcut($linkPath)
    if($readback.TargetPath -ine $scriptHost -or $readback.Arguments -cne $expectedArgs){throw 'Dedicated shortcut verification failed.'}
  }
  $links+=$linkPath
}
$receipt=[ordered]@{installedAtUtc=[datetime]::UtcNow.ToString('o');version='1.0.0';destination=$destination;repairBackup=$(if($Repair){$backup}else{''});filesVerified=@($manifest.files.PSObject.Properties).Count;shortcuts=$links;officialFilesChanged=$false;codexConfigChanged=$false;startupTaskCreated=$false}
[IO.File]::WriteAllText((Join-Path $parent 'installation.json'),($receipt|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
$receipt|ConvertTo-Json -Depth 4
}finally{Exit-XiaomuMaintenance $maintenance}

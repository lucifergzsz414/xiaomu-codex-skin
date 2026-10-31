[CmdletBinding()]
param([ValidateSet('Inspect','Apply','Restore','Functions')][string]$Mode='Inspect',[string[]]$ShortcutRoots=@())
$ErrorActionPreference='Stop'
function Test-XiaomuShortcutTarget($Target,$Arguments,$Executable,$Root){
  $wscript=Join-Path $env:SystemRoot 'System32\wscript.exe'
  $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $legacy=Join-Path $env:LOCALAPPDATA 'Programs\CodexDreamSkin\setup-bootstrap.ps1'
  return ($Target -ieq $Executable -and -not $Arguments) -or
    ($Target -ieq (Join-Path $env:SystemRoot 'explorer.exe') -and $Arguments -ieq 'shell:AppsFolder\OpenAI.Codex_2p2nqsd0c76g0!App') -or
    ($Target -ieq $wscript -and $Arguments -ceq ('"'+(Join-Path $Root 'launch.vbs')+'"')) -or
    ($Target -ieq $powershell -and $Arguments -ceq ('-NoProfile -STA -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "'+$legacy+'" -LaunchTray'))
}
function Test-XiaomuEntryPath($Path,$Roots){
  $full=[IO.Path]::GetFullPath($Path)
  if([IO.Path]::GetExtension($full) -ine '.lnk'){return $false}
  foreach($allowed in $Roots){
    $base=[IO.Path]::GetFullPath($allowed).TrimEnd('\')+'\'
    if(-not $full.StartsWith($base,[StringComparison]::OrdinalIgnoreCase)){continue}
    $cursor=$full
    while($cursor -and $cursor.Length -ge $base.TrimEnd('\').Length){
      if(Test-Path -LiteralPath $cursor){if(((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){return $false}}
      $cursor=Split-Path $cursor -Parent
    }
    return $true
  }
  return $false
}
function Get-XiaomuEntryFiles($Roots){
  $queue=New-Object 'System.Collections.Generic.Queue[object]'
  for($index=0;$index -lt $Roots.Count;$index++){
    $base=$Roots[$index]
    if(Test-Path -LiteralPath $base){$queue.Enqueue(@{path=$base;depth=0;maxDepth=$(if($index -eq 1){6}else{0})})}
  }
  $count=0
  while($queue.Count -gt 0){
    $item=$queue.Dequeue()
    foreach($child in @(Get-ChildItem -LiteralPath $item.path -Force -ErrorAction SilentlyContinue)){
      if(++$count -gt 10000){throw 'Shortcut scan limit reached.'}
      if(($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){continue}
      if($child.PSIsContainer){if($item.depth -lt $item.maxDepth){$queue.Enqueue(@{path=$child.FullName;depth=$item.depth+1;maxDepth=$item.maxDepth})}}
      elseif($child.Extension -ieq '.lnk' -and (Test-XiaomuEntryPath $child.FullName $Roots)){$child.FullName}
    }
  }
}
function Sync-XiaomuEntrypoints($Root,$Roots,$Executable,$Action){
  $statePath=Join-Path $Root 'entrypoints.json'
  $backupRoot=Join-Path $Root 'entrypoint-backups'
  foreach($guard in @($Root,$statePath)){if(Test-Path -LiteralPath $guard){if(((Get-Item -LiteralPath $guard).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Invalid managed entrypoint path.'}}}
  if(Test-Path -LiteralPath $backupRoot){if(((Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Invalid backup directory.'}}
  $state=[pscustomobject]@{schema=1;entries=@()}
  if(Test-Path -LiteralPath $statePath){$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json;if($state.schema -ne 1){throw 'Unknown entrypoint receipt.'}}
  $result=[ordered]@{mode=$Action;changed=0;unchanged=0;skipped=0;entries=@();scope='current-user desktop, programs, taskbar shortcut files'}
  if($Action -eq 'Restore'){
    $remaining=@()
    foreach($entry in @($state.entries)){
      if(-not (Test-XiaomuEntryPath $entry.path $Roots)){$remaining+=$entry;$result.skipped++;continue}
      if(-not (Test-Path -LiteralPath $entry.path)){$result.skipped++;continue}
      $currentHash=(Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash
      if(-not $entry.created -and $currentHash -ceq $entry.originalSha256){$result.unchanged++;continue}
      if($currentHash -cne $entry.installedSha256){$remaining+=$entry;$result.skipped++;continue}
      if($entry.created){Remove-Item -LiteralPath $entry.path}
      else{
        if($entry.backup -cnotmatch '^[a-f0-9]{32}\.lnk$'){throw 'Invalid shortcut backup name.'}
        $backup=Join-Path $backupRoot $entry.backup
        if((Get-FileHash -LiteralPath $backup -Algorithm SHA256).Hash -cne $entry.originalSha256){throw 'Shortcut backup changed.'}
        Copy-Item -LiteralPath $backup -Destination $entry.path
        if((Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash -cne $entry.originalSha256){throw 'Shortcut restore verification failed.'}
      }
      $result.changed++
    }
    $state.entries=$remaining
  } else {
    $shell=New-Object -ComObject WScript.Shell
    $paths=@(Get-XiaomuEntryFiles $Roots)
    # Create conventional entries only where the name is free; never replace an unrelated link by name.
    foreach($base in @($Roots|Select-Object -First 2)){$canonical=Join-Path $base 'Codex.lnk';if((Test-Path -LiteralPath $base) -and -not (Test-Path -LiteralPath $canonical)){$paths+=$canonical}}
    foreach($file in @($paths|Select-Object -Unique)){
      if(-not (Test-XiaomuEntryPath $file $Roots)){$result.skipped++;continue}
      $created=-not (Test-Path -LiteralPath $file)
      $link=$shell.CreateShortcut($file)
      if(-not $created -and -not (Test-XiaomuShortcutTarget $link.TargetPath $link.Arguments $Executable $Root)){continue}
      $tracked=@($state.entries|Where-Object {$_.path -ieq $file})
      if($tracked.Count){
        if(-not $created -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ceq $tracked[0].installedSha256){$result.unchanged++}else{$result.skipped++}
        continue
      }
      $target=Join-Path $env:SystemRoot 'System32\wscript.exe'
      $arguments='"'+(Join-Path $Root 'launch.vbs')+'"'
      if(-not $created -and $link.TargetPath -ieq $target -and $link.Arguments -ceq $arguments){$result.unchanged++;continue}
      $result.entries+=@{path=$file;created=$created}
      if($Action -eq 'Inspect'){continue}
      $backupName='';$originalSha=''
      if(-not $created){
        $null=New-Item -ItemType Directory -Path $backupRoot -Force
        $backupName=[guid]::NewGuid().ToString('N')+'.lnk'
        $originalSha=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
        Copy-Item -LiteralPath $file -Destination (Join-Path $backupRoot $backupName)
        if((Get-FileHash -LiteralPath (Join-Path $backupRoot $backupName) -Algorithm SHA256).Hash -cne $originalSha){throw 'Shortcut backup failed.'}
      }
      try{
        $link.TargetPath=$target;$link.Arguments=$arguments;$link.WorkingDirectory=$Root
        $link.IconLocation=(Join-Path $Root 'xiaomu.ico')+',0';$link.Description='小睦 Codex'
        $link.Save()
        $verify=$shell.CreateShortcut($file)
        if($verify.TargetPath -ine $target -or $verify.Arguments -cne $arguments){throw 'Shortcut verification failed.'}
      }catch{if(-not $created){Copy-Item -LiteralPath (Join-Path $backupRoot $backupName) -Destination $file};throw}
      $state.entries+=@{path=$file;created=$created;backup=$backupName;originalSha256=$originalSha;installedSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
      # Save after every verified change so partial installation remains recoverable.
      [IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
      $result.changed++
    }
  }
  if($Action -ne 'Inspect'){[IO.File]::WriteAllText($statePath,($state|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))}
  return [pscustomobject]$result
}
if($Mode -eq 'Functions'){return}
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$executable=''
if($Mode -ne 'Restore'){. (Join-Path $PSScriptRoot 'common-windows.ps1');$executable=(Get-DreamSkinCodexInstall).Executable}
$roots=if($ShortcutRoots.Count){$ShortcutRoots}else{@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))}
Sync-XiaomuEntrypoints $PSScriptRoot $roots $executable $Mode|ConvertTo-Json -Depth 6

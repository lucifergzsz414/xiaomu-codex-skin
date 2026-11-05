[CmdletBinding()]
param([ValidateSet('Inspect','Apply','Restore','Functions')][string]$Mode='Inspect',[string[]]$ShortcutRoots=@())
$ErrorActionPreference='Stop'
function New-XiaomuShortcutShell {
  # WScript.Shell converts shortcut filenames through the system ANSI code page.
  # Use the Unicode Shell Link interface and IPersistFile for every load/save.
  if(-not ('Xiaomu.UnicodeShortcutsV1.Factory' -as [type])){
    Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;
namespace Xiaomu.UnicodeShortcutsV1 {
    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int count, IntPtr findData, uint flags);
        void GetIDList(out IntPtr itemList);
        void SetIDList(IntPtr itemList);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string value);
        void GetHotkey(out short value);
        void SetHotkey(short value);
        void GetShowCmd(out int value);
        void SetShowCmd(int value);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder value, int count, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string value, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string value, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string value);
    }
    public sealed class Factory {
        public Shortcut CreateShortcut(string path) { return new Shortcut(path); }
    }
    public sealed class Shortcut {
        private readonly string path;
        private readonly IShellLinkW link;
        internal Shortcut(string value) {
            path = Path.GetFullPath(value);
            if (!String.Equals(Path.GetExtension(path), ".lnk", StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException("Only .lnk shortcut files are supported.");
            link = (IShellLinkW)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("00021401-0000-0000-C000-000000000046"), true));
            if (File.Exists(path)) ((IPersistFile)link).Load(path, 0);
        }
        public string TargetPath {
            get { var b = new StringBuilder(32768); link.GetPath(b, b.Capacity, IntPtr.Zero, 0); return b.ToString(); }
            set { link.SetPath(value ?? ""); }
        }
        public string Arguments {
            get { var b = new StringBuilder(32768); link.GetArguments(b, b.Capacity); return b.ToString(); }
            set { link.SetArguments(value ?? ""); }
        }
        public string WorkingDirectory {
            get { var b = new StringBuilder(32768); link.GetWorkingDirectory(b, b.Capacity); return b.ToString(); }
            set { link.SetWorkingDirectory(value ?? ""); }
        }
        public string Description {
            get { var b = new StringBuilder(32768); link.GetDescription(b, b.Capacity); return b.ToString(); }
            set { link.SetDescription(value ?? ""); }
        }
        public int WindowStyle {
            get { int value; link.GetShowCmd(out value); return value; }
            set { link.SetShowCmd(value); }
        }
        public string IconLocation {
            get { var b = new StringBuilder(32768); int index; link.GetIconLocation(b, b.Capacity, out index); return b.ToString() + "," + index.ToString(CultureInfo.InvariantCulture); }
            set {
                string location = value ?? ""; int index = 0;
                int comma = location.LastIndexOf(',');
                if (comma >= 0 && Int32.TryParse(location.Substring(comma + 1), NumberStyles.Integer, CultureInfo.InvariantCulture, out index))
                    location = location.Substring(0, comma);
                link.SetIconLocation(location, index);
            }
        }
        public void Save() { ((IPersistFile)link).Save(path, true); }
    }
}
'@
  }
  return [Xiaomu.UnicodeShortcutsV1.Factory]::new()
}
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
function Save-XiaomuEntryState($StatePath,$State) {
  $temporary=$StatePath+'.'+[guid]::NewGuid().ToString('N')+'.tmp'
  try{
    [IO.File]::WriteAllText($temporary,($State|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
    if([IO.File]::Exists($StatePath)){[IO.File]::Replace($temporary,$StatePath,[NullString]::Value)}
    else{[IO.File]::Move($temporary,$StatePath)}
  }finally{if([IO.File]::Exists($temporary)){[IO.File]::Delete($temporary)}}
}
function Backup-XiaomuEntry($File,$BackupRoot,$ExpectedHash) {
  $null=New-Item -ItemType Directory -Path $BackupRoot -Force
  $name=[guid]::NewGuid().ToString('N')+'.lnk'
  $copy=Join-Path $BackupRoot $name
  Copy-Item -LiteralPath $File -Destination $copy
  if((Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -cne $ExpectedHash){throw 'Shortcut backup failed.'}
  return $name
}
function Retire-XiaomuCreatedEntry($State,$StatePath,$Entry,$File,$Roots,$BackupRoot,$Link,$LaunchTarget,$LaunchArgs) {
  if($Entry.created -isnot [bool] -or -not $Entry.created -or $Entry.installedSha256 -cnotmatch '^[0-9A-F]{64}$'){return $false}
  if($Entry.backup -isnot [string] -or $Entry.backup -cne '' -or $Entry.originalSha256 -isnot [string] -or $Entry.originalSha256 -cne ''){return $false}
  $canonical=@($Roots|Select-Object -First 2|Where-Object{$_}|ForEach-Object{Join-Path ([IO.Path]::GetFullPath($_)) 'Codex.lnk'})
  if($File -notin $canonical){return $false}
  if($Link.TargetPath -ine $LaunchTarget -or $Link.Arguments -cne $LaunchArgs){return $false}
  $hash=(Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash
  if($hash -cne $Entry.installedSha256){return $false}
  $archive=@($State.retired|Where-Object{$_.path -ieq $File -and $_.sha256 -ceq $hash})
  if($archive.Count -gt 1){return $false}
  if($archive.Count -eq 0){
    $name=Backup-XiaomuEntry $File $BackupRoot $hash
    if(-not $State.PSObject.Properties['retired']){$State|Add-Member -NotePropertyName retired -NotePropertyValue @()}
    $State.retired+=@{path=$File;backup=$name;sha256=$hash}
    # Persist the archive receipt before removing the visible link.
    Save-XiaomuEntryState $StatePath $State
  }else{
    if($archive[0].backup -cnotmatch '^[a-f0-9]{32}\.lnk$'){return $false}
    $copy=Join-Path $BackupRoot $archive[0].backup
    if(-not (Test-XiaomuEntryPath $copy @($BackupRoot)) -or -not (Test-Path -LiteralPath $copy -PathType Leaf) -or (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash -cne $hash){return $false}
  }
  if(-not (Test-XiaomuEntryPath $File $Roots) -or -not (Test-Path -LiteralPath $File -PathType Leaf) -or (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash -cne $hash){return $false}
  Remove-Item -LiteralPath $File
  $State.entries=@($State.entries|Where-Object{$_.path -ine $File})
  Save-XiaomuEntryState $StatePath $State
  return $true
}
function Sync-XiaomuEntrypoints($Root,$Roots,$Executable,$Action){
  $statePath=Join-Path $Root 'entrypoints.json'
  $backupRoot=Join-Path $Root 'entrypoint-backups'
  foreach($guard in @($Root,$statePath)){if(Test-Path -LiteralPath $guard){if(((Get-Item -LiteralPath $guard).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Invalid managed entrypoint path.'}}}
  if(Test-Path -LiteralPath $backupRoot){if(((Get-Item -LiteralPath $backupRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Invalid backup directory.'}}
  $state=[pscustomobject]@{schema=1;entries=@()}
  if(Test-Path -LiteralPath $statePath){$state=Get-Content -LiteralPath $statePath -Raw -Encoding utf8|ConvertFrom-Json;if($state.schema -ne 1){throw 'Unknown entrypoint receipt.'}}
  $result=[ordered]@{mode=$Action;changed=0;unchanged=0;skipped=0;retired=0;entries=@();scope='current-user desktop, programs, taskbar shortcut files'}
  $target=Join-Path $env:SystemRoot 'System32\wscript.exe'
  $arguments='"'+(Join-Path $Root 'launch.vbs')+'"'
  if($Action -eq 'Restore'){
    $remaining=@()
    $shell=$null
    foreach($entry in @($state.entries)){
      if(-not (Test-XiaomuEntryPath $entry.path $Roots)){$remaining+=$entry;$result.skipped++;continue}
      if(-not (Test-Path -LiteralPath $entry.path)){
        $archived=@($state.retired|Where-Object{$_.path -ieq $entry.path -and $_.sha256 -ceq $entry.installedSha256})
        if($entry.created -and $archived.Count -eq 1){$result.unchanged++}else{$result.skipped++}
        continue
      }
      $currentHash=(Get-FileHash -LiteralPath $entry.path -Algorithm SHA256).Hash
      if(-not $entry.created -and $currentHash -ceq $entry.originalSha256){$result.unchanged++;continue}
      if($currentHash -cne $entry.installedSha256){$remaining+=$entry;$result.skipped++;continue}
      if($entry.created){
        if(-not $shell){$shell=New-XiaomuShortcutShell}
        try{$link=$shell.CreateShortcut($entry.path)}catch{$remaining+=$entry;$result.skipped++;continue}
        if(-not (Retire-XiaomuCreatedEntry $state $statePath $entry $entry.path $Roots $backupRoot $link $target $arguments)){
          $remaining+=$entry;$result.skipped++;continue
        }
        $result.retired++
      }else{
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
    $shell=New-XiaomuShortcutShell
    foreach($file in @(Get-XiaomuEntryFiles $Roots|Select-Object -Unique)){
      if(-not (Test-XiaomuEntryPath $file $Roots) -or -not (Test-Path -LiteralPath $file -PathType Leaf)){$result.skipped++;continue}
      try{$link=$shell.CreateShortcut($file)}catch{$result.skipped++;continue}
      $tracked=@($state.entries|Where-Object {$_.path -ieq $file})
      if($tracked.Count){
        if($Action -eq 'Apply' -and $tracked.Count -eq 1 -and
          (Retire-XiaomuCreatedEntry $state $statePath $tracked[0] $file $Roots $backupRoot $link $target $arguments)){
          $result.changed++;$result.retired++;continue
        }
        if($tracked.Count -eq 1 -and (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ceq $tracked[0].installedSha256){$result.unchanged++}else{$result.skipped++}
        continue
      }
      if(-not (Test-XiaomuShortcutTarget $link.TargetPath $link.Arguments $Executable $Root)){continue}
      if($link.TargetPath -ieq $target -and $link.Arguments -ceq $arguments){$result.unchanged++;continue}
      $result.entries+=@{path=$file;created=$false}
      if($Action -eq 'Inspect'){continue}
      $originalSha=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
      $backupName=Backup-XiaomuEntry $file $backupRoot $originalSha
      try{
        $link.TargetPath=$target;$link.Arguments=$arguments;$link.WorkingDirectory=$Root
        $link.IconLocation=(Join-Path $Root 'xiaomu.ico')+',0';$link.Description='小睦 Codex'
        $link.Save()
        $verify=$shell.CreateShortcut($file)
        if($verify.TargetPath -ine $target -or $verify.Arguments -cne $arguments){throw 'Shortcut verification failed.'}
        $state.entries+=@{path=$file;created=$false;backup=$backupName;originalSha256=$originalSha;installedSha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash}
        Save-XiaomuEntryState $statePath $state
      }catch{
        Copy-Item -LiteralPath (Join-Path $backupRoot $backupName) -Destination $file
        throw
      }
      $result.changed++
    }
  }
  if($Action -ne 'Inspect'){Save-XiaomuEntryState $statePath $state}
  return [pscustomobject]$result
}
if($Mode -eq 'Functions'){return}
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
$executable=''
if($Mode -ne 'Restore'){. (Join-Path $PSScriptRoot 'common-windows.ps1');$executable=(Get-DreamSkinCodexInstall).Executable}
$roots=if($ShortcutRoots.Count){$ShortcutRoots}else{@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))}
Sync-XiaomuEntrypoints $PSScriptRoot $roots $executable $Mode|ConvertTo-Json -Depth 6

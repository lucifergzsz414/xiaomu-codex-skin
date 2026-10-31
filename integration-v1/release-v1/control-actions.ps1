[CmdletBinding()]
param([ValidateSet('Inspect','Install','Start','Pause','Restore','Functions')][string]$Action='Inspect',[string]$PackageRoot='')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
function Test-ControlPackage([string]$Root) {
  $manifest=Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
  if($manifest.id -cne 'xiaomu-codex-skin' -or $manifest.version -cne '1.0.0'){throw '安装包标识不匹配。'}
  $properties=@($manifest.files.PSObject.Properties)
  foreach($required in @('maintenance.ps1','manager.ps1','restore.ps1','entrypoints.ps1','control-actions.ps1','control-center.ps1','manage.vbs','install.ps1','XiaomuSkinManager.exe','skin.js')){
    if($required -notin $properties.Name){throw '安装包缺少必要组件。'}
  }
  foreach($file in $properties){
    if($file.Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]+$' -or $file.Value -notmatch '^[a-fA-F0-9]{64}$'){throw '安装清单格式无效。'}
    $path=Join-Path $Root $file.Name
    if(((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw '安装文件不能是链接。'}
    if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ine $file.Value){throw ('文件校验未通过：'+$file.Name)}
  }
  return $manifest
}
function Get-ControlRuntime([string]$Root) {
  $status=$null
  try{$status=Get-Content -LiteralPath (Join-Path $Root 'status.json') -Raw -Encoding utf8 | ConvertFrom-Json}catch{}
  $busy=$false;$handle=$null
  try{$handle=[IO.File]::Open((Join-Path $Root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch [IO.IOException]{$busy=$true}finally{if($handle){$handle.Dispose()}}
  $fresh=$false
  if($status.atUtc){try{$age=([datetime]::UtcNow-[datetime]::Parse($status.atUtc).ToUniversalTime()).TotalSeconds;$fresh=$age -ge -5 -and $age -lt 20}catch{}}
  if(Test-Path -LiteralPath (Join-Path $Root 'stop.flag')){
    if($busy){return 'stopping'}
    try{$last=Get-Content -LiteralPath (Join-Path $Root 'control-state.json') -Raw -Encoding utf8|ConvertFrom-Json;if($last.action -ceq 'Restore'){return 'restored'}}catch{}
    return 'paused'
  }
  if(-not $busy){return 'stopped'}
  if(-not $fresh){return 'checking'}
  if($status.status -ceq 'active' -and $status.activePages -gt 0){return 'active'}
  return [string]$status.status
}
function Start-ControlManager([string]$Root) {
  $ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $null=Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $Root 'manager.ps1')+'"'),'-Mode','Start') -WindowStyle Hidden -PassThru
}
function Assert-ControlPath([string]$Path) {
  $cursor=[IO.Path]::GetFullPath($Path)
  while($cursor){
    if((Test-Path -LiteralPath $cursor) -and ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw '管理路径不能经过目录链接。'}
    $cursor=Split-Path $cursor -Parent
  }
}
function Stop-ControlSession([string]$Root) {
  Assert-ControlPath $Root
  foreach($name in @('stop.flag','session.lock')){Assert-ControlPath (Join-Path $Root $name)}
  [IO.File]::WriteAllText((Join-Path $Root 'stop.flag'),'stop')
  for($i=0;$i -lt 225;$i++){
    $handle=$null
    try{$handle=[IO.File]::Open((Join-Path $Root 'session.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)}catch [IO.IOException]{Start-Sleep -Milliseconds 200;continue}
    if($handle){$handle.Dispose();return}
  }
  throw '仍在等待皮肤会话退出，未替换文件，也未关闭 Codex。请稍后重试。'
}
function Restore-ControlInstallation([string]$Root,[string]$Source,[string[]]$Roots=@()) {
  # Recovery executes only the separately verified package, never damaged installed scripts.
  $null=Test-ControlPackage $Source
  . (Join-Path $Source 'maintenance.ps1')
  $gate=Enter-XiaomuMaintenance $Root
  try{
  Stop-ControlSession $Root
  . (Join-Path $Source 'entrypoints.ps1') -Mode Functions
  if(-not $Roots.Count){$Roots=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('Programs'),(Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'))}
  if(Test-Path -LiteralPath (Join-Path $Root 'entrypoints.json')){
    $result=Sync-XiaomuEntrypoints $Root $Roots '' 'Restore'
    if($result.skipped){return '皮肤已停止。部分入口已变动，已保留，未覆盖；请检查入口恢复记录。'}
  }
  return '已停止皮肤并恢复未被改动的受管入口，未关闭 Codex。'
  }finally{Exit-XiaomuMaintenance $gate}
}
function Get-ControlDependencies([string]$NodePath='C:\Program Files\nodejs\node.exe') {
  $issues=New-Object 'System.Collections.Generic.List[string]'
  $nodeVersion=''
  if(-not (Test-Path -LiteralPath $NodePath -PathType Leaf)){$issues.Add('缺少 Node.js：请安装 22 或更高版本到 C:\Program Files\nodejs，再重新检测。')}
  else{
    try{
      $nodeVersion=(& $NodePath --version 2>$null|Out-String).Trim()
      if($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v(\d+)\.' -or [int]$Matches[1] -lt 22){$issues.Add('Node.js 版本不适用：需要 22 或更高版本。')}
    }catch{$issues.Add('Node.js 无法运行，请修复 Node.js 安装后重新检测。')}
  }
  $codex=$null
  try{$codex=Get-AppxPackage -Name OpenAI.Codex -ErrorAction Stop|Select-Object -First 1}catch{}
  if(-not $codex){$issues.Add('未找到当前用户的官方 Codex：请先从 Microsoft Store 安装并打开一次。')}
  elseif($codex.SignatureKind -ine 'Store' -or $codex.IsDevelopmentMode -or $codex.PackageFamilyName -cne 'OpenAI.Codex_2p2nqsd0c76g0'){$issues.Add('当前 Codex 不是支持的官方 Store 安装，暂不启用皮肤。')}
  return [pscustomobject]@{ready=($issues.Count -eq 0);nodeVersion=$nodeVersion;codexVersion=$(if($codex){[string]$codex.Version}else{''});issues=@($issues)}
}
if($Action -eq 'Functions'){return}
try {
  $source=[IO.Path]::GetFullPath($(if($PackageRoot){$PackageRoot}else{$PSScriptRoot}))
  $target=Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin\1.0.0'
  Assert-ControlPath $target
  $installed=Test-Path -LiteralPath $target -PathType Container
  $dependencies=Get-ControlDependencies
  $integrity='not-installed';$integrityDetail='';$manifest=$null
  if($installed){
    try{$manifest=Test-ControlPackage $target;$integrity='verified'}catch{$integrity='damaged';$integrityDetail=$_.Exception.Message}
  }
  $message=''
  switch($Action){
    'Install' {
      $null=Test-ControlPackage $source
      if($installed -and $integrity -eq 'damaged'){
        if($source.TrimEnd('\') -ieq $target.TrimEnd('\')){throw '需要另一份完整安装包：请关闭此管理窗口，打开重新解压的安装包中的 manage.vbs，再修复。'}
        . (Join-Path $source 'maintenance.ps1')
        $gate=Enter-XiaomuMaintenance $target
        try{Stop-ControlSession $target;& (Join-Path $source 'install.ps1') -SourceRoot $source -Repair | Out-Null}finally{Exit-XiaomuMaintenance $gate}
        $message='损坏文件已由完整安装包修复，旧目录已备份。皮肤保持暂停，可点击启动。'
      }else{
        & (Join-Path $source 'install.ps1') -SourceRoot $source | Out-Null
        $message='安装文件校验通过，管理入口已补齐。'
      }
      $installed=$true;$manifest=Test-ControlPackage $target;$integrity='verified';$integrityDetail=''
    }
    'Start' {
      if(-not $installed -or $integrity -ne 'verified'){throw '安装文件不完整，先选择完整安装包并修复，再启动。'}
      if(-not $dependencies.ready){throw ($dependencies.issues -join ' ')}
      Start-ControlManager $target
      $message='已请求启用；已有 Codex 无诊断连接时等待正常退出，不会强制关闭。'
    }
    'Pause' {if($installed){Stop-ControlSession $target;$message='已请求暂停皮肤，未执行安装目录内的脚本，也未关闭 Codex。'}}
    'Restore' {
      if($installed){$message=Restore-ControlInstallation $target $source}
    }
  }
  if($installed -and $Action -in @('Start','Pause','Restore')){
    Assert-ControlPath (Join-Path $target 'control-state.json')
    [IO.File]::WriteAllText((Join-Path $target 'control-state.json'),(@{action=$Action;atUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
  }
  $compatibility='unknown';$version=$dependencies.codexVersion;$disabled=@();$detail=''
  if($installed -and $integrity -eq 'verified' -and $dependencies.ready){
    try{
      $inspection=& (Join-Path $target 'manager.ps1') -Mode Inspect | Out-String
      $result=$inspection|ConvertFrom-Json
      $compatibility=$result.compatibility;$version=$result.packageVersion;$disabled=@($result.disabled)
    }catch{$detail='兼容检查未完成：'+$_.Exception.Message}
  }
  if($integrity -eq 'damaged'){$detail='安装文件损坏：'+$integrityDetail+'。请关闭当前管理窗口，从另一份完整安装包打开 manage.vbs，可修复或恢复。'}
  if(-not $dependencies.ready){$detail=($dependencies.issues -join ' ')+' '+$detail}
  $runtime=if($installed){Get-ControlRuntime $target}else{'not-installed'}
  if($Action -eq 'Start' -and $runtime -in @('paused','restored','stopped')){$runtime='checking'}
  [ordered]@{ok=$true;installed=$installed;integrity=$integrity;dependencies=$dependencies;skinVersion=$(if($manifest){$manifest.version}else{'1.0.0'});runtime=$runtime;compatibility=$compatibility;codexVersion=$version;disabled=$disabled;message=$message;detail=$detail;checkedAtUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5 -Compress
}catch{
  [ordered]@{ok=$false;message=$_.Exception.Message;checkedAtUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
  exit 1
}

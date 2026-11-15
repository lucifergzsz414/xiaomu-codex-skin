[CmdletBinding()]
param([ValidateSet('Inspect','Install','Start','Pause','Restore','CheckUpdate','Update','ApplyUpdate','Functions')][string]$Action='Inspect',[string]$PackageRoot='',[int]$ManagerPid=0,[string]$ManagerStartUtc='',[string]$HandoffPath='')
$ErrorActionPreference='Stop'
$script:ControlWorkerBytes=[IO.File]::ReadAllBytes($PSCommandPath)
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
$env:PSModulePath="$env:SystemRoot\System32\WindowsPowerShell\v1.0\Modules;$env:ProgramFiles\WindowsPowerShell\Modules"
function Test-ControlPackage([string]$Root) {
  $manifest=Get-Content -LiteralPath (Join-Path $Root 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
  if($manifest.id -cne 'xiaomu-codex-skin'){throw '安装包标识不匹配。'}
  $null=ConvertTo-ControlVersion $manifest.version
  $layout=$manifest.PSObject.Properties['installationLayoutVersion']
  if(($null -ne $layout -and $layout.Value -cne '1.0.0') -or ($null -eq $layout -and $manifest.version -cne '1.0.0')){throw '安装目录格式不匹配。'}
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
function ConvertTo-ControlVersion([string]$Value) {
  if($Value -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$'){throw '版本号格式无效。'}
  try{return [version]$Value}catch{throw '版本号超出支持范围。'}
}
function Get-ControlPaths {
  $base=Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin'
  return [pscustomobject]@{target=(Join-Path $base '1.0.0');updates=(Join-Path $base 'updates')}
}
function Test-ControlDownloadUri([string]$Value) {
  $uri=$null
  if(-not [uri]::TryCreate($Value,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -cne 'https' -or $uri.Port -ne 443 -or $uri.UserInfo -or $uri.Fragment -or $uri.Host -cnotin @('github.com','release-assets.githubusercontent.com')){throw '下载地址不受支持。'}
  return $uri
}
function Get-ControlRelease($Api) {
  if($Api.draft -ne $false -or $Api.prerelease -ne $false -or $Api.tag_name -cnotmatch '^v(\d+\.\d+\.\d+)$'){throw '最新发布不是正式版本。'}
  $version=[string]$Matches[1];$null=ConvertTo-ControlVersion $version
  $base='https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/'
  if($Api.html_url -cne ($base+'tag/v'+$version)){throw '发布地址不匹配。'}
  $assets=@($Api.assets|Where-Object {$_.name -cmatch '^xiaomu-codex-skin-[A-Za-z0-9._-]+\.zip$'})
  if($assets.Count -ne 1){throw '发布包数量不明确。'}
  $asset=$assets[0];$size=0L
  if($asset.state -cne 'uploaded' -or -not [long]::TryParse([string]$asset.size,[ref]$size) -or $size -le 0 -or $size -gt 104857600 -or $asset.digest -cnotmatch '^sha256:([a-f0-9]{64})$'){throw '发布包缺少有效的大小或 SHA256 校验。'}
  $sha=[string]$Matches[1];$url=$base+'download/v'+$version+'/'+$asset.name
  if($asset.browser_download_url -cne $url){throw '发布包地址不匹配。'}
  $null=Test-ControlDownloadUri $url
  $candidate=$asset.name.Substring('xiaomu-codex-skin-'.Length,$asset.name.Length-'xiaomu-codex-skin-'.Length-4)
  return [pscustomobject]@{version=$version;size=$size;sha256=$sha;url=$url;releaseUrl=$Api.html_url;name=$asset.name;candidateId=$candidate}
}
function Get-ControlUpdateState($Local,$Release) {
  $localVersion=ConvertTo-ControlVersion $Local.version;$stable=$Local.releaseChannel -ceq 'stable'
  if($stable){$localVersion=ConvertTo-ControlVersion $Local.releaseLabel;if($localVersion -ne (ConvertTo-ControlVersion $Local.version)){throw '本地版本记录不一致。'}}
  $label=if($Local.releaseLabel){[string]$Local.releaseLabel}else{[string]$Local.version};$channel=if($Local.releaseChannel){[string]$Local.releaseChannel}else{'local'}
  $current=if($stable){$label}else{$label+' ('+$channel+')'}
  $remote=ConvertTo-ControlVersion $Release.version;$state='current';$message='已经是最新版本。';$can=$false
  if($remote -lt $localVersion){$state='ahead';$message='当前版本高于正式发布，保留当前版本。'}
  elseif($remote -gt $localVersion -or -not $stable){$state='available';$message='有正式版本可以更新。';$can=$true}
  return [pscustomobject]@{state=$state;currentVersion=$current;latestVersion=$Release.version;canUpdate=$can;releaseUrl=$Release.releaseUrl;message=$message}
}
function Test-ControlUpgrade($Source,$Installed) {
  $sourceVersion=ConvertTo-ControlVersion $Source.version;$installedVersion=ConvertTo-ControlVersion $Installed.version
  if($Source.releaseChannel -ceq 'stable'){$sourceVersion=ConvertTo-ControlVersion $Source.releaseLabel}
  if($Installed.releaseChannel -ceq 'stable'){$installedVersion=ConvertTo-ControlVersion $Installed.releaseLabel}
  if($sourceVersion -ne $installedVersion){return $sourceVersion -gt $installedVersion}
  if($Source.releaseChannel -ceq 'stable' -and $Installed.releaseChannel -cne 'stable'){return $true}
  return ($Source.releaseChannel -cne 'stable' -and $Installed.releaseChannel -cne 'stable' -and $Source.candidateId -cgt $Installed.candidateId)
}
function Invoke-ControlRequest([string]$Url,[string]$Destination='',[long]$Limit=1048576) {
  [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $api='https://api.github.com/repos/lucifergzsz414/xiaomu-codex-skin/releases/latest';$isApi=$Url -ceq $api
  if(-not $isApi){$null=Test-ControlDownloadUri $Url}
  for($hop=0;$hop -le 5;$hop++){
    $response=$null;$input=$null;$output=$null
    try{
      $request=[Net.HttpWebRequest]::Create($Url);$request.AllowAutoRedirect=$false;$request.Timeout=15000;$request.ReadWriteTimeout=15000;$request.UserAgent='XiaomuCodexSkin-Update/1.0';$request.Accept='application/vnd.github+json'
      try{$response=$request.GetResponse()}catch{throw '无法连接 GitHub，请稍后重试。'}
      $status=[int]$response.StatusCode
      if($status -in @(301,302,303,307,308)){
        if($isApi -or $hop -eq 5){throw '下载重定向超出支持范围。'}
        $next=[uri]::new([uri]$Url,[string]$response.Headers['Location']);$null=Test-ControlDownloadUri $next.AbsoluteUri;$Url=$next.AbsoluteUri;continue
      }
      if($status -ne 200 -or $response.ContentLength -gt $Limit){throw '下载响应或大小不符合预期。'}
      $input=$response.GetResponseStream();$output=if($Destination){[IO.File]::Open($Destination,[IO.FileMode]::CreateNew)}else{[IO.MemoryStream]::new()}
      $buffer=New-Object byte[] 65536;$total=0L;$deadline=[datetime]::UtcNow.AddSeconds(90)
      while(($count=$input.Read($buffer,0,$buffer.Length)) -gt 0){$total+=$count;if($total -gt $Limit -or [datetime]::UtcNow -gt $deadline){throw '下载超时或超出大小限制。'};$output.Write($buffer,0,$count)}
      if(-not $Destination){return [Text.Encoding]::UTF8.GetString($output.ToArray())}
      return
    }finally{if($output){$output.Dispose()};if($input){$input.Dispose()};if($response){$response.Dispose()}}
  }
}
function Get-ControlLatestRelease {return Get-ControlRelease ((Invoke-ControlRequest 'https://api.github.com/repos/lucifergzsz414/xiaomu-codex-skin/releases/latest')|ConvertFrom-Json)}
function Test-ControlZipName([string]$Name) {
  if(-not $Name -or $Name.Length -gt 180 -or $Name -cnotmatch '^[A-Za-z0-9._/-]+$' -or $Name.StartsWith('/') -or $Name.EndsWith('/')){throw '压缩包路径无效。'}
  foreach($part in $Name.Split('/')){if(-not $part -or $part -in @('.','..') -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)' -or $part -match '[<>"|?*]'){throw '压缩包包含不安全文件名。'}}
}
function Expand-ControlUpdate([string]$Zip,[string]$Destination,$Release) {
  Assert-ControlPath $Zip;Assert-ControlPath $Destination
  if((Get-Item -LiteralPath $Zip).Length -ne $Release.size -or (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash -ine $Release.sha256){throw '下载包大小或 SHA256 校验失败。'}
  if(Test-Path -LiteralPath $Destination){throw '更新解压目录必须为空。'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem;Add-Type -AssemblyName System.IO.Compression
  $archive=[IO.Compression.ZipFile]::OpenRead($Zip)
  try{
    $names=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase);$total=0L
    if($archive.Entries.Count -ne 32){throw '发布包应包含 32 个文件。'}
    foreach($entry in $archive.Entries){
      Test-ControlZipName $entry.FullName
      $unix=($entry.ExternalAttributes -shr 16) -band 61440
      if(-not $names.Add($entry.FullName) -or $unix -notin @(0,32768) -or (($entry.ExternalAttributes -band 1040) -ne 0) -or $entry.Length -gt 52428800){throw '压缩包包含重复、链接或过大文件。'}
      $total+=$entry.Length;if($total -gt 157286400){throw '压缩包解压大小超限。'}
    }
    if(-not $names.Contains('FILES-SHA256.json') -or -not $names.Contains('RELEASE-CANDIDATE.json') -or -not $names.Contains('skin/manifest.json')){throw '发布包缺少校验清单。'}
    $null=New-Item -ItemType Directory -Path $Destination
    $actualTotal=0L;$buffer=New-Object byte[] 65536
    foreach($entry in $archive.Entries){
      $path=Join-Path $Destination $entry.FullName.Replace('/','\');$null=New-Item -ItemType Directory -Path (Split-Path $path) -Force
      $input=$null;$output=$null;$actual=0L
      try{
        $input=$entry.Open();$output=[IO.File]::Open($path,[IO.FileMode]::CreateNew)
        while(($count=$input.Read($buffer,0,$buffer.Length)) -gt 0){
          $actual+=$count;$actualTotal+=$count
          if($actual -gt $entry.Length -or $actual -gt 52428800 -or $actualTotal -gt 157286400){throw '压缩包实际解压大小超限或与声明不符。'}
          $output.Write($buffer,0,$count)
        }
        if($actual -ne $entry.Length){throw '压缩包实际解压大小与声明不符。'}
      }finally{if($output){$output.Dispose()};if($input){$input.Dispose()}}
    }
  }finally{$archive.Dispose()}
  return Test-ControlUpdateDirectory $Destination $Release
}
function Test-ControlUpdateDirectory([string]$Directory,$Release) {
  Assert-ControlPath $Directory
  $items=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force -File);$checks=Get-Content -LiteralPath (Join-Path $Directory 'FILES-SHA256.json') -Raw -Encoding utf8|ConvertFrom-Json;$entries=@($checks.PSObject.Properties)
  if($items.Count -ne 32 -or $entries.Count -ne 31){throw '发布包文件集合不完整。'}
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach($entry in $entries){
    Test-ControlZipName $entry.Name
    if(-not $seen.Add($entry.Name) -or $entry.Value -cnotmatch '^[a-fA-F0-9]{64}$'){throw '发布包校验清单无效。'}
    $file=Join-Path $Directory $entry.Name.Replace('/','\');Assert-ControlPath $file
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $entry.Value){throw '发布包文件校验失败。'}
  }
  foreach($item in $items){$name=$item.FullName.Substring($Directory.TrimEnd('\').Length+1).Replace('\','/');if($name -cne 'FILES-SHA256.json' -and -not $seen.Contains($name)){throw '发布包含未列出的文件。'}}
  foreach($item in @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)){Assert-ControlPath $item.FullName}
  $source=Join-Path $Directory 'skin';$manifest=Test-ControlPackage $source;$receipt=Get-Content -LiteralPath (Join-Path $Directory 'RELEASE-CANDIDATE.json') -Raw -Encoding utf8|ConvertFrom-Json
  $hash=(Get-FileHash -LiteralPath (Join-Path $source 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  if(@($manifest.files.PSObject.Properties).Count -ne 24 -or $receipt.managedFilesVerified -ne 24 -or $manifest.releaseLabel -cne $Release.version -or $manifest.releaseChannel -cne 'stable' -or $manifest.version -cne $Release.version -or $manifest.candidateId -cne $Release.candidateId -or $manifest.candidateId -cnotmatch '^[A-Za-z0-9._-]{1,100}$' -or $receipt.packageManifestSHA256 -ine $hash -or $receipt.candidateId -cne $manifest.candidateId -or $receipt.runtimeVersion -cne $manifest.version -or $receipt.releaseLabel -cne $manifest.releaseLabel -or $receipt.releaseChannel -cne 'stable'){throw '发布包版本或身份不匹配。'}
  return [pscustomobject]@{source=$source;manifest=$manifest;manifestSHA256=$hash}
}
function Get-ControlManagerIdentity([int]$ProcessId,[string]$StartUtc,[string]$Source) {
  $process=Get-Process -Id $ProcessId -ErrorAction Stop;$path=[IO.Path]::GetFullPath($process.Path);$expected=Join-Path $Source 'XiaomuSkinManager.exe'
  $birth=$process.StartTime.ToUniversalTime().ToString('o');$requested=[datetime]::Parse($StartUtc).ToUniversalTime().ToString('o')
  if($birth -cne $requested -or $path -ine $expected){throw '管理窗口身份已变化，请重新检查更新。'}
  return [pscustomobject]@{pid=$ProcessId;startUtc=$birth;path=$path}
}
function Assert-ControlManagerParent([int]$ProcessId) {
  $self=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID)
  if([int]$self.ParentProcessId -ne $ProcessId){throw '更新必须由当前管理窗口发起。'}
}
function Start-ControlHandoff([string]$Worker,[string]$Ticket) {
  $ps=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $null=Start-Process $ps -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$Worker+'"'),'-Action','ApplyUpdate','-HandoffPath',('"'+$Ticket+'"')) -WindowStyle Hidden -PassThru
}
function New-ControlUpdateHandoff([string]$Stage,$Release,$Verified,[int]$ProcessId,[string]$StartUtc,[string]$Source) {
  $paths=Get-ControlPaths;Assert-ControlManagerParent $ProcessId;$identity=Get-ControlManagerIdentity $ProcessId $StartUtc $Source
  $worker=Join-Path $Stage 'apply-update.ps1';[IO.File]::WriteAllBytes($worker,$script:ControlWorkerBytes)
  $ticket=Join-Path $Stage 'handoff.json'
  $data=[ordered]@{schema=1;createdAtUtc=[datetime]::UtcNow.ToString('o');target=[IO.Path]::GetFullPath($paths.target);installedManifestSHA256=(Get-FileHash -LiteralPath (Join-Path $paths.target 'manifest.json')).Hash;workerSHA256=(Get-FileHash -LiteralPath $worker).Hash;sourceManifestSHA256=$Verified.manifestSHA256;candidateId=$Verified.manifest.candidateId;release=$Release;manager=$identity}
  [IO.File]::WriteAllText($ticket,($data|ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false));Start-ControlHandoff $worker $ticket;return $ticket
}
function Wait-ControlManagerExit($Identity) {
  $deadline=[datetime]::UtcNow.AddSeconds(45)
  do{
    $process=Get-Process -Id ([int]$Identity.pid) -ErrorAction SilentlyContinue
    if(-not $process){return}
    if($process.StartTime.ToUniversalTime().Ticks -ne (([datetime]$Identity.startUtc).ToUniversalTime().Ticks) -or $process.Path -ine $Identity.path){throw '管理进程身份已变化，未替换文件。'}
    Start-Sleep -Milliseconds 200
  }while([datetime]::UtcNow -lt $deadline)
  throw '管理窗口未退出，更新已停止。关闭管理窗口后可重新更新。'
}
function Invoke-ControlRepair([string]$Source,[string]$Target) {& (Join-Path $Source 'install.ps1') -SourceRoot $Source -Repair|Out-Null}
function Open-ControlCenter([string]$Root) {$null=Start-Process (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList ('"'+(Join-Path $Root 'manage.vbs')+'"') -WindowStyle Hidden -PassThru}
function Enter-ControlUpdateMaintenance([string]$Source,[string]$Target,$Manifest) {
  $path=Join-Path $Source 'maintenance.ps1';Assert-ControlPath $path
  if((Get-FileHash -LiteralPath $path).Hash -ine $Manifest.files.'maintenance.ps1'){throw '维护组件校验失败。'}
  . $path
  return Enter-XiaomuMaintenance $Target
}
function Exit-ControlUpdateMaintenance($Mutex) {if($Mutex){try{$Mutex.ReleaseMutex()}finally{$Mutex.Dispose()}}}
function Write-ControlUpdateResult($Paths,$Result,[string]$Stage) {
  $message=([string]$Result.message -replace '[\r\n]+',' ');if($message.Length -gt 300){$message=$message.Substring(0,300)}
  $record=[ordered]@{schema=1;ok=[bool]$Result.ok;version=[string]$Result.version;message=$message;atUtc=[datetime]::UtcNow.ToString('o')}
  foreach($path in @((Join-Path $Stage 'result.json'),(Join-Path $Paths.updates 'last-result.json'))){Assert-ControlPath $path;[IO.File]::WriteAllText($path,($record|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))}
}
function Get-ControlUpdateResult {
  $path=Join-Path (Get-ControlPaths).updates 'last-result.json'
  try{Assert-ControlPath $path;if((Get-Item -LiteralPath $path).Length -gt 4096){return $null};$record=Get-Content -LiteralPath $path -Raw -Encoding utf8|ConvertFrom-Json
    if($record.schema -ne 1 -or $record.ok -isnot [bool] -or $record.message -isnot [string] -or $record.message.Length -gt 300){return $null}
    $null=[datetime]$record.atUtc
    return [pscustomobject]@{schema=1;ok=$record.ok;version=[string]$record.version;message=$record.message;atUtc=$record.atUtc}
  }catch{return $null}
}
function Invoke-ControlApplyUpdate([string]$TicketPath) {
  $paths=Get-ControlPaths;$ticketFull=[IO.Path]::GetFullPath($TicketPath);$stage=Split-Path $ticketFull
  Assert-ControlPath $ticketFull
  if((Split-Path $stage) -ine [IO.Path]::GetFullPath($paths.updates).TrimEnd('\') -or (Split-Path $stage -Leaf) -cnotmatch '^[a-f0-9]{32}$' -or (Split-Path $ticketFull -Leaf) -cne 'handoff.json'){throw '更新交接路径无效。'}
  $resultPath=Join-Path $stage 'result.json'
  try{
    if((Get-Item -LiteralPath $ticketFull).Length -gt 16384){throw '更新交接记录过大。'}
    $ticket=Get-Content -LiteralPath $ticketFull -Raw -Encoding utf8|ConvertFrom-Json
    $age=([datetime]::UtcNow-([datetime]$ticket.createdAtUtc).ToUniversalTime()).TotalSeconds
    if($ticket.schema -ne 1 -or $age -lt -5 -or $age -gt 600 -or $ticket.target -ine [IO.Path]::GetFullPath($paths.target) -or $ticket.workerSHA256 -ine (Get-FileHash -LiteralPath (Join-Path $stage 'apply-update.ps1')).Hash){throw '更新交接记录已变化或过期。'}
    # Reconstruct the accepted GitHub identity, rather than accepting ticket URLs.
    $r=$ticket.release;$api=[pscustomobject]@{tag_name=('v'+$r.version);draft=$false;prerelease=$false;html_url=$r.releaseUrl;assets=@([pscustomobject]@{name=$r.name;state='uploaded';size=$r.size;digest=('sha256:'+$r.sha256);browser_download_url=$r.url})};$release=Get-ControlRelease $api
    Wait-ControlManagerExit $ticket.manager
    Assert-ControlPath $paths.target
    $zip=Join-Path $stage 'package.zip';if((Get-Item -LiteralPath $zip).Length -ne $release.size -or (Get-FileHash -LiteralPath $zip).Hash -ine $release.sha256){throw '下载包校验失败。'}
    $verified=Test-ControlUpdateDirectory (Join-Path $stage 'verified') $release
    if($verified.manifestSHA256 -ine $ticket.sourceManifestSHA256 -or $verified.manifest.candidateId -cne $ticket.candidateId){throw '更新源在交接期间发生变化。'}
    $gate=$null
    try{
      $gate=Enter-ControlUpdateMaintenance $verified.source $paths.target $verified.manifest
      if((Get-FileHash -LiteralPath (Join-Path $paths.target 'manifest.json')).Hash -ine $ticket.installedManifestSHA256){throw '安装目录在更新期间发生变化，请重新检查更新。'}
      $installed=Test-ControlPackage $paths.target
      if(-not (Get-ControlUpdateState $installed $release).canUpdate){throw '当前安装已不需要该更新。'}
      Stop-ControlSession $paths.target
      Invoke-ControlRepair $verified.source $paths.target
    }finally{Exit-ControlUpdateMaintenance $gate}
    Open-ControlCenter $paths.target
    $result=@{ok=$true;version=$release.version;message='已更新，皮肤保持暂停，可在管理器中启用。'}
  }catch{
    $result=@{ok=$false;version=$(if($release){$release.version}else{''});message=$_.Exception.Message}
    try{Assert-ControlPath $paths.target;$null=Test-ControlPackage $paths.target;Open-ControlCenter $paths.target}catch{}
    throw
  }finally{if($result){Write-ControlUpdateResult $paths $result $stage}}
}
function Invoke-ControlUpdateAction([string]$Mode,[string]$Source,[int]$ProcessId,[string]$StartUtc) {
  $state=[pscustomobject]@{state='error';currentVersion='';latestVersion='';canUpdate=$false;releaseUrl='https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/latest';message=''}
  try{
    $paths=Get-ControlPaths;$local=Test-ControlPackage $paths.target;$release=Get-ControlLatestRelease;$state=Get-ControlUpdateState $local $release;$close=$false
    if($Mode -ceq 'Update' -and $state.canUpdate){
      $null=Test-ControlPackage $Source
      Assert-ControlManagerParent $ProcessId;$null=Get-ControlManagerIdentity $ProcessId $StartUtc $Source
      Assert-ControlPath $paths.updates;$stage=Join-Path $paths.updates ([guid]::NewGuid().ToString('N'));$null=New-Item -ItemType Directory $stage -Force
      Invoke-ControlRequest $release.url (Join-Path $stage 'package.zip') $release.size
      $verified=Expand-ControlUpdate (Join-Path $stage 'package.zip') (Join-Path $stage 'verified') $release
      $null=New-ControlUpdateHandoff $stage $release $verified $ProcessId $StartUtc $Source
      $state.state='handoff';$state.canUpdate=$false;$state.message='下载已校验，关闭管理窗口后完成更新。';$close=$true
    }
    return [ordered]@{ok=$true;kind='update';update=$state;closeManagerForUpdate=$close}
  }catch{$state.state='error';$state.canUpdate=$false;$state.message=$_.Exception.Message;return [ordered]@{ok=$false;kind='update';update=$state;closeManagerForUpdate=$false;message=$state.message}}
}
if($Action -eq 'Functions'){return}
if($Action -in @('CheckUpdate','Update')){Invoke-ControlUpdateAction $Action ([IO.Path]::GetFullPath($(if($PackageRoot){$PackageRoot}else{$PSScriptRoot}))) $ManagerPid $ManagerStartUtc|ConvertTo-Json -Depth 6 -Compress;return}
if($Action -eq 'ApplyUpdate'){try{if([IO.Path]::GetFullPath($PSCommandPath) -ine (Join-Path (Split-Path ([IO.Path]::GetFullPath($HandoffPath))) 'apply-update.ps1')){throw '更新交接入口无效。'};Invoke-ControlApplyUpdate $HandoffPath}catch{exit 1};return}
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
      $sourceManifest=Test-ControlPackage $source
      $upgrade=$installed -and $integrity -eq 'verified' -and $source.TrimEnd('\') -ine $target.TrimEnd('\') -and (Test-ControlUpgrade $sourceManifest $manifest)
      if($installed -and ($integrity -eq 'damaged' -or $upgrade)){
        if($source.TrimEnd('\') -ieq $target.TrimEnd('\')){throw '需要另一份完整安装包：请关闭此管理窗口，打开重新解压的安装包中的 manage.vbs，再修复。'}
        . (Join-Path $source 'maintenance.ps1')
        $gate=Enter-XiaomuMaintenance $target
        try{Stop-ControlSession $target;& (Join-Path $source 'install.ps1') -SourceRoot $source -Repair | Out-Null}finally{Exit-XiaomuMaintenance $gate}
        $message=if($upgrade){'已更新到新安装包，旧目录已备份。皮肤保持暂停，可点击启动。'}else{'损坏文件已由完整安装包修复，旧目录已备份。皮肤保持暂停，可点击启动。'}
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
  [ordered]@{ok=$true;installed=$installed;integrity=$integrity;dependencies=$dependencies;skinVersion=$(if($manifest){$manifest.version}else{'1.0.0'});runtime=$runtime;compatibility=$compatibility;codexVersion=$version;disabled=$disabled;message=$message;detail=$detail;updateResult=(Get-ControlUpdateResult);checkedAtUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 5 -Compress
}catch{
  [ordered]@{ok=$false;message=$_.Exception.Message;checkedAtUtc=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json -Compress
  exit 1
}

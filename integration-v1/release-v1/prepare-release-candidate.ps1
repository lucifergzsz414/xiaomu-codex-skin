[CmdletBinding()]
param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'package'
$manifestPath=Join-Path $source 'manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8|ConvertFrom-Json
$candidateId='20261031-3384-rc2'
$releaseLabel='1.0.0-beta.2'
$stem='xiaomu-codex-skin-'+$releaseLabel+'-'+$candidateId
if($manifest.id -cne 'xiaomu-codex-skin' -or $manifest.version -cne '1.0.0' -or $manifest.releaseLabel -cne $releaseLabel -or $manifest.releaseChannel -cne 'public-beta' -or $manifest.candidateId -cne $candidateId -or $manifest.validatedCodexVersion -cne '26.1027.3384.0'){throw 'Unexpected release identity.'}
if($manifest.files.'skin.js' -cne '6ddb217b9193233bd2027b925d9972a442cf68306f63cd0d63b79680ad44eaed'){throw 'The accepted skin bundle changed.'}
$entries=@($manifest.files.PSObject.Properties)
if($entries.Count -ne 24){throw 'Unexpected managed file count.'}
$names=@($entries.Name)+@('manifest.json')
foreach($name in $names){
  if($name -cnotmatch '^[A-Za-z0-9][A-Za-z0-9._-]+$'){throw 'Invalid package filename.'}
  $file=Get-Item -LiteralPath (Join-Path $source $name)
  if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Package entries must be regular files.'}
}
foreach($entry in $entries){if($entry.Value -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $source $entry.Name) -Algorithm SHA256).Hash -ine $entry.Value){throw ('Package hash mismatch: '+$entry.Name)}}
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$sourceCommit=(& git -C $project rev-parse HEAD|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $sourceCommit -cnotmatch '^[a-f0-9]{40}$'){throw 'A committed source checkout is required.'}
$dirty=& git -C $project status --porcelain --untracked-files=normal
if($LASTEXITCODE -ne 0 -or $dirty){throw 'Commit the publication sources before sealing the package.'}
$testedCommit='adec39e598897a653d654a3a051f102e5dd92ed4'
foreach($name in @('install.ps1','entrypoints.ps1')){
  $tested=(& git -C $project rev-parse ($testedCommit+':integration-v1/release-v1/'+$name)|Out-String).Trim()
  if($LASTEXITCODE -ne 0){throw 'Cannot resolve tested installer source.'}
  $current=(& git -C $project hash-object -- (Join-Path $PSScriptRoot $name)|Out-String).Trim()
  if($LASTEXITCODE -ne 0 -or $tested -cne $current){throw 'Installer source no longer matches the independent Windows acceptance.'}
}
$priorPath=Join-Path $project 'qa\results\windows-server-2022-20261031.json'
$prior=Get-Content -LiteralPath $priorPath -Raw -Encoding utf8|ConvertFrom-Json
if(-not $prior.technicalChecksPassed -or $prior.passed -ne 26 -or $prior.candidate -cne $candidateId -or $prior.officialCodexLaunched -ne $false -or $prior.independentDesktopWindowsVerified -ne $false){throw 'Prior source-candidate evidence has an unexpected scope.'}
$extras=[ordered]@{
  'START-HERE.md'='START-HERE.md'
  'CLEAN-TEST-GUIDE.md'='CLEAN-TEST-GUIDE.md'
  'clean-environment-check.ps1'='clean-environment-check.ps1'
  'skin/RELEASE-NOTES-1.0.0-beta.2.md'='RELEASE-NOTES-1.0.0-beta.2.md'
  'skin/ASSET-SOURCES.md'='ASSET-SOURCES.md'
}
foreach($item in $extras.GetEnumerator()){
  $file=Get-Item -LiteralPath (Join-Path $PSScriptRoot $item.Value)
  if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid release document.'}
}
$bundle=Join-Path $OutputDirectory $stem
$zip=Join-Path $OutputDirectory ($stem+'.zip')
foreach($path in @($bundle,$zip,($zip+'.sha256'))){if(Test-Path -LiteralPath $path){throw 'Sealed release output already exists; it must not be overwritten.'}}
$null=New-Item -ItemType Directory -Path (Join-Path $bundle 'skin')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $source $name) -Destination (Join-Path $bundle ('skin\'+$name))}
foreach($item in $extras.GetEnumerator()){Copy-Item -LiteralPath (Join-Path $PSScriptRoot $item.Value) -Destination (Join-Path $bundle ($item.Key.Replace('/','\')))}
$manifestHash=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt=[ordered]@{
  schema=1;releaseLabel=$releaseLabel;candidateId=$candidateId;runtimeVersion='1.0.0';releaseChannel='public-beta'
  sourceCommit=$sourceCommit;packageManifestSHA256=$manifestHash;managedFilesVerified=$entries.Count
  preparedAtUtc=[datetime]::UtcNow.ToString('o');publicationStatusAtBuild='prepared-for-public-prerelease'
  sourceCandidateAcceptance=[ordered]@{passed=$true;checks=26;sourceCommit=$testedCommit;runUrl='https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41189074442';reportSHA256=(Get-FileHash -LiteralPath $priorPath -Algorithm SHA256).Hash.ToLowerInvariant();scope='Independent Windows Server 2022 administrator installation and recovery; no actual Codex startup.'}
  exactArchiveAcceptance='Recorded separately after sealing; see GitHub release notes and acceptance run.'
  independentCleanWindowsVerified=$false;officialCodexStartupVerified=$false
  remaining=@('Windows 11 ordinary-user Store Codex startup and visuals','System reboot and subsequent skin loading','Browser download and unsigned-program security prompts','Incomplete visual asset provenance and redistribution records')
}
[IO.File]::WriteAllText((Join-Path $bundle 'RELEASE-CANDIDATE.json'),($receipt|ConvertTo-Json -Depth 6),[Text.UTF8Encoding]::new($false))
$expected=@($names|ForEach-Object{'skin/'+$_})+@($extras.Keys)+@('RELEASE-CANDIDATE.json')
if(@($expected|Select-Object -Unique).Count -ne $expected.Count){throw 'Duplicate release path.'}
$checksums=[ordered]@{}
foreach($name in $expected){
  $path=Join-Path $bundle ($name.Replace('/','\'))
  $checksums[$name]=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  if($name.StartsWith('skin/') -and $name.Substring(5) -cin $entries.Name -and $checksums[$name] -cne $manifest.files.($name.Substring(5))){throw 'Staged runtime bytes changed.'}
}
if($checksums['skin/manifest.json'] -cne $manifestHash){throw 'Staged runtime manifest changed.'}
[IO.File]::WriteAllText((Join-Path $bundle 'FILES-SHA256.json'),($checksums|ConvertTo-Json -Depth 3),[Text.UTF8Encoding]::new($false))
$expected+=@('FILES-SHA256.json')
if($expected.Count -ne 32){throw 'Unexpected release entry count.'}
Add-Type -AssemblyName System.IO.Compression,System.IO.Compression.FileSystem
$writer=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
try{foreach($name in $expected){$null=[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($writer,(Join-Path $bundle ($name.Replace('/','\'))),$name,[IO.Compression.CompressionLevel]::Optimal)}}finally{$writer.Dispose()}
$archive=[IO.Compression.ZipFile]::OpenRead($zip)
$hash=[Security.Cryptography.SHA256]::Create()
$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
try{
  if($archive.Entries.Count -ne $expected.Count){throw 'Unexpected archive entry count.'}
  foreach($entry in $archive.Entries){
    if($entry.FullName -cnotin $expected -or -not $seen.Add($entry.FullName)){throw 'Unexpected or duplicate archive entry.'}
    $stream=$entry.Open();try{$digest=[BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','')}finally{$stream.Dispose()}
    if($digest -ine (Get-FileHash -LiteralPath (Join-Path $bundle ($entry.FullName.Replace('/','\'))) -Algorithm SHA256).Hash){throw 'Archive readback differs from staged content.'}
  }
}finally{$hash.Dispose();$archive.Dispose()}
$zipHash=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(($zip+'.sha256'),($zipHash+'  '+[IO.Path]::GetFileName($zip)+[Environment]::NewLine),[Text.UTF8Encoding]::new($false))
[ordered]@{candidateId=$candidateId;zip=$zip;sha256=$zipHash;manifestSha256=$manifestHash;entries=$expected.Count;bytes=(Get-Item -LiteralPath $zip).Length;sourceCommit=$sourceCommit}|ConvertTo-Json -Depth 3

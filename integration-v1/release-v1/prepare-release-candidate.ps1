[CmdletBinding()]
param([string]$OutputDirectory=(Join-Path $PSScriptRoot 'dist'),[Parameter(Mandatory=$true)][string]$ValidationReport)
$ErrorActionPreference='Stop'
$source=Join-Path $PSScriptRoot 'package'
$manifestPath=Join-Path $source 'manifest.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw -Encoding utf8|ConvertFrom-Json
$release=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-candidate.json') -Raw -Encoding utf8|ConvertFrom-Json
$candidateId=$release.candidateId
$releaseLabel=$release.releaseLabel
$stem='xiaomu-codex-skin-'+$candidateId
if($candidateId -cnotmatch '^\d{8}-\d+-rc\d+$'){throw 'Invalid candidate identity.'}
if($manifest.id -cne 'xiaomu-codex-skin' -or $manifest.version -cne $release.runtimeVersion -or $manifest.releaseLabel -cne $releaseLabel -or $manifest.releaseChannel -cne $release.releaseChannel -or $manifest.candidateId -cne $candidateId -or $manifest.validatedCodexVersion -cne $release.validatedCodexVersion){throw 'Unexpected release identity.'}
if($manifest.files.'skin.js' -cne $release.skinSHA256 -or $manifest.files.'engine.cjs' -cne $release.engineSHA256){throw 'The accepted runtime changed.'}
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
$validation=Get-Content -LiteralPath $ValidationReport -Raw -Encoding utf8|ConvertFrom-Json
if($validation.sourceCommit -cne $sourceCommit -or $validation.candidateId -cne $candidateId -or $validation.tests -ne 195 -or $validation.passed -ne 195 -or $validation.failed -ne 0 -or $validation.skipped -ne 0 -or $validation.skinSHA256 -cne $release.skinSHA256 -or $validation.engineSHA256 -cne $release.engineSHA256){throw 'Source validation does not match this committed candidate.'}
$extras=[ordered]@{
  'START-HERE.md'='START-HERE.md'
  'CLEAN-TEST-GUIDE.md'='CLEAN-TEST-GUIDE.md'
  'clean-environment-check.ps1'='clean-environment-check.ps1'
  'skin/RELEASE-NOTES-6628-rc1.md'='RELEASE-NOTES-6628-rc1.md'
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
  schema=1;releaseLabel=$releaseLabel;candidateId=$candidateId;runtimeVersion=$release.runtimeVersion;releaseChannel=$release.releaseChannel
  sourceCommit=$sourceCommit;packageManifestSHA256=$manifestHash;managedFilesVerified=$entries.Count
  preparedAtUtc=[datetime]::UtcNow.ToString('o');publicationStatusAtBuild='local-candidate-not-published'
  sourceCandidateAcceptance=[ordered]@{tests=$validation.tests;passed=$validation.passed;failed=$validation.failed;skipped=$validation.skipped;sourceCommit=$sourceCommit;reportSHA256=(Get-FileHash -LiteralPath $ValidationReport -Algorithm SHA256).Hash.ToLowerInvariant();scope='Offline runtime regression tests, including headless synthetic page fixtures; no live Codex restart.'}
  exactArchiveAcceptance='Recorded separately after sealing in archive-smoke-result.json.'
  independentCleanWindowsVerified=$false;standalonePackageColdStartVerified=$false
  installedHotUpdateVerified=$true;liveCompatibilityVerified=$true;realSearchAndMenuInteractionsVerified=$false
  installedOpeningUserConfirmed=$false;terminalVisualVerified=$false;repositoryAccessApprovalVisualVerified=$false;repositoryAccessApprovalActionVerified=$false;commandExecutionApprovalVerified=$false;fileDiffVerified=$false
  localAcceptanceSHA256=$release.localAcceptanceSHA256
  localAcceptance=[ordered]@{scope='Codex 26.1106.6628.0; existing process hot update and read-only metadata, no UI navigation';compatibility='All six component capabilities enabled; active skin, no conflicts';process='Same Codex process and start time; opening ledger unchanged';draft='User reported no unsent draft before hot update; non-empty draft preservation not exercised'}
  syntheticSurfaceAcceptance=[ordered]@{scope='Headless synthetic page fixtures, not native live page interaction';home='644/320px cards and original action preservation';settings='320px input/button identity and value preservation';diff='644/320px minimal shadow CSS consumer; not the native formatter'}
  remaining=@('Current 6628 real search, context-menu and submenu interaction','Command execution approval','Standalone package cold startup','Independent Windows 11 ordinary-user installation, startup and recovery','Browser download and first-run prompts','Outstanding asset provenance and redistribution records')
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

[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
$project=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$release=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release-candidate.json') -Raw -Encoding utf8|ConvertFrom-Json
$sourceTestCount=$release.sourceTestCount
if(($sourceTestCount -isnot [int] -and $sourceTestCount -isnot [long]) -or $sourceTestCount -le 0 -or $sourceTestCount -gt [int]::MaxValue){throw 'Invalid source test count.'}
$sourceCommit=(& git -C $project rev-parse HEAD|Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $sourceCommit -cnotmatch '^[a-f0-9]{40}$'){throw 'A committed source checkout is required.'}
$dirty=& git -C $project status --porcelain --untracked-files=normal
if($LASTEXITCODE -ne 0 -or $dirty){throw 'Commit candidate sources before validation.'}
& node (Join-Path $project 'integration-v1\native-v1\build-native.cjs')
if($LASTEXITCODE -ne 0){throw 'Native build failed.'}
$skinSHA256=(Get-FileHash -LiteralPath (Join-Path $project 'integration-v1\native-v1\native-skin.js') -Algorithm SHA256).Hash.ToLowerInvariant()
$engineSHA256=(Get-FileHash -LiteralPath (Join-Path $PSScriptRoot 'engine.cjs') -Algorithm SHA256).Hash.ToLowerInvariant()
if($skinSHA256 -cne $release.skinSHA256 -or $engineSHA256 -cne $release.engineSHA256){throw 'Runtime pins differ from the accepted candidate.'}
$tests=@(Get-ChildItem -LiteralPath (Join-Path $project 'integration-v1\native-v1') -Filter '*.test.cjs' -File|ForEach-Object{$_.FullName})+@(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.test.cjs' -File|ForEach-Object{$_.FullName})
$tap=(& node --test --test-concurrency=1 --test-reporter=tap @tests|Out-String)
if($LASTEXITCODE -ne 0){throw ('Runtime regression failed: '+$tap)}
$counts=@{}
foreach($key in @('tests','pass','fail','skipped')){
  $match=[regex]::Match($tap,('(?m)^# '+$key+' (\d+)\r?$'))
  if(-not $match.Success){throw 'Missing runtime regression summary.'}
  $counts[$key]=[int]$match.Groups[1].Value
}
if($counts.tests -ne $sourceTestCount -or $counts.pass -ne $sourceTestCount -or $counts.fail -ne 0 -or $counts.skipped -ne 0){throw ('Expected '+$sourceTestCount+' passing runtime checks with no skips. Configure the existing Playwright module and Chromium executable.')}
$report=[ordered]@{schema=1;candidateId=$release.candidateId;sourceCommit=$sourceCommit;tests=$counts.tests;passed=$counts.pass;failed=$counts.fail;skipped=$counts.skipped;skinSHA256=$skinSHA256;engineSHA256=$engineSHA256;scope='Offline runtime checks and headless synthetic page fixtures';atUtc=[datetime]::UtcNow.ToString('o')}
$output=[IO.Path]::GetFullPath($OutputFile)
$null=New-Item -ItemType Directory -Path (Split-Path $output -Parent) -Force
[IO.File]::WriteAllText($output,($report|ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText(($output+'.tap'),$tap,[Text.UTF8Encoding]::new($false))
$report|ConvertTo-Json -Depth 4

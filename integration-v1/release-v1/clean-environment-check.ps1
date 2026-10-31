param(
  [ValidateSet('ValidatePackage','Before','Installed','Started','Restored')][string]$Phase='ValidatePackage',
  [string]$SkinPackage=(Join-Path $PSScriptRoot 'skin'),
  [string]$ReportDirectory=(Join-Path $PSScriptRoot 'acceptance-results')
)
$ErrorActionPreference='Stop'
$checks=New-Object 'System.Collections.Generic.List[object]'
function Check($name,$value){$checks.Add([pscustomobject]@{name=$name;passed=[bool]$value})}
function Read-Runtime($Root){
  $lockPath=Join-Path $Root 'session.lock';$handle=$null;$busy=$false
  if(Test-Path -LiteralPath $lockPath){
    try{$handle=[IO.File]::Open($lockPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)}catch [IO.IOException]{$busy=Test-Path -LiteralPath $lockPath}finally{if($handle){$handle.Dispose()}}
  }
  if(Test-Path -LiteralPath (Join-Path $Root 'stop.flag')){if($busy){return 'stopping'};return 'paused'}
  if(-not $busy){return 'stopped'}
  $status=Get-Content -LiteralPath (Join-Path $Root 'status.json') -Raw|ConvertFrom-Json
  $age=([datetime]::UtcNow-[datetime]::Parse($status.atUtc).ToUniversalTime()).TotalSeconds
  if($status.status -ceq 'active' -and $status.activePages -gt 0 -and $age -ge -5 -and $age -lt 20){return 'active'}
  return 'checking'
}
function Prior-Passed($Name,$Candidate,$RunId){
  $path=Join-Path $ReportDirectory ($Name+'.json')
  if(-not (Test-Path -LiteralPath $path)){return $false}
  $prior=Get-Content -LiteralPath $path -Raw|ConvertFrom-Json
  return $prior.phase -eq $Name -and $prior.technicalChecksPassed -and $prior.candidateManifestSha256 -ceq $Candidate -and $prior.testRunId -ceq $RunId
}
try{
  $manifest=Get-Content -LiteralPath (Join-Path $SkinPackage 'manifest.json') -Raw -Encoding utf8|ConvertFrom-Json
  if($manifest.id -cne 'xiaomu-codex-skin' -or $manifest.version -cne '1.0.0'){throw 'Unexpected package identity.'}
  foreach($entry in $manifest.files.PSObject.Properties){
    if($entry.Name -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]+$' -or $entry.Value -notmatch '^[a-fA-F0-9]{64}$'){throw 'Invalid package manifest.'}
    $file=Get-Item -LiteralPath (Join-Path $SkinPackage $entry.Name)
    if($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ine $entry.Value){throw ('Package file mismatch: '+$entry.Name)}
  }
  Check 'package hashes match' $true
  $candidate=(Get-FileHash -LiteralPath (Join-Path $SkinPackage 'manifest.json') -Algorithm SHA256).Hash.ToLowerInvariant()
  $runId=''
  . (Join-Path $SkinPackage 'control-actions.ps1') -Action Functions
  $null=Test-ControlPackage $SkinPackage
  $dependencies=Get-ControlDependencies
  $installParent=Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin'
  $installed=Join-Path $installParent '1.0.0'
  $runtime='not-checked'
  if($Phase -eq 'Before'){$runId=[guid]::NewGuid().ToString('N');$runtime=if(Test-Path -LiteralPath $installParent){'pre-existing-installation'}else{'not-installed'};Check 'no previous skin installation or repair backup' (-not (Test-Path -LiteralPath $installParent))}
  elseif($Phase -ne 'ValidatePackage'){
    $installedManifest=Test-ControlPackage $installed
    Check 'installed manifest matches this exact candidate' ((Get-FileHash -LiteralPath (Join-Path $installed 'manifest.json') -Algorithm SHA256).Hash -ceq (Get-FileHash -LiteralPath (Join-Path $SkinPackage 'manifest.json') -Algorithm SHA256).Hash)
    $runtime=Read-Runtime $installed
    $baselinePath=Join-Path $ReportDirectory 'Before.json'
    if(Test-Path -LiteralPath $baselinePath){$baseline=Get-Content -LiteralPath $baselinePath -Raw|ConvertFrom-Json;$runId=[string]$baseline.testRunId}
    Check 'Before baseline passed for this exact candidate and run' ($runId -cmatch '^[a-f0-9]{32}$' -and (Prior-Passed 'Before' $candidate $runId))
    if($Phase -eq 'Started'){
      Check 'Installed checks passed for this candidate and run' (Prior-Passed 'Installed' $candidate $runId)
      Check 'dependencies ready' $dependencies.ready
      Check 'fresh active page and held session lock' ($runtime -ceq 'active')
      if($runtime -ceq 'active'){
        $verification=& (Join-Path $installed 'manager.ps1') -Mode Verify|Out-String
        Check 'native endpoint owner verified' ($verification.Trim() -ceq 'verified')
      }
    }
    if($Phase -eq 'Restored'){
      Check 'prior Started checks passed for this candidate and run' (Prior-Passed 'Started' $candidate $runId)
      Check 'session stopped and stop flag retained' ($runtime -in @('restored','paused') -and (Test-Path -LiteralPath (Join-Path $installed 'stop.flag')))
      $remaining=0
      if(Test-Path -LiteralPath (Join-Path $installed 'entrypoints.json')){$remaining=@((Get-Content -LiteralPath (Join-Path $installed 'entrypoints.json') -Raw|ConvertFrom-Json).entries).Count}
      Check 'no unresolved managed shortcut records' ($remaining -eq 0)
    }
  }
  $failed=@($checks|Where-Object{-not $_.passed})
  $result=[ordered]@{phase=$Phase;candidateManifestSha256=$candidate;testRunId=$runId;atUtc=[datetime]::UtcNow.ToString('o');technicalChecksPassed=($failed.Count -eq 0);checks=$checks.ToArray();dependencies=$dependencies;runtime=$runtime;independentCleanWindowsVerified=$false;visualReviewRequired=$true;note='This checker cannot prove OS freshness or visual correctness. Complete the manual checklist on a separate Windows environment.'}
}catch{$result=[ordered]@{phase=$Phase;atUtc=[datetime]::UtcNow.ToString('o');technicalChecksPassed=$false;error=$_.Exception.Message;independentCleanWindowsVerified=$false;visualReviewRequired=$true}}
$null=New-Item -ItemType Directory -Path $ReportDirectory -Force
$json=$result|ConvertTo-Json -Depth 6
[IO.File]::WriteAllText((Join-Path $ReportDirectory ($Phase+'.json')),$json,[Text.UTF8Encoding]::new($false))
$json
if(-not $result.technicalChecksPassed){exit 1}

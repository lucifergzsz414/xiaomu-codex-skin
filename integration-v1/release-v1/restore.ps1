param([string[]]$ShortcutRoots=@())
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'maintenance.ps1')
$maintenance=Enter-XiaomuMaintenance $PSScriptRoot
try{
& (Join-Path $PSScriptRoot 'manager.ps1') -Mode Stop
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'entrypoints.json')){
  & (Join-Path $PSScriptRoot 'entrypoints.ps1') -Mode Restore -ShortcutRoots $ShortcutRoots
}
}finally{Exit-XiaomuMaintenance $maintenance}

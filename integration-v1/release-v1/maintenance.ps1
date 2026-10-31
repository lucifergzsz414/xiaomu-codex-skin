function Enter-XiaomuMaintenance([string]$Root,[int]$TimeoutMs=10000) {
  $path=[IO.Path]::GetFullPath($Root).TrimEnd('\').ToLowerInvariant()
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$digest=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($path))).Replace('-','')}finally{$sha.Dispose()}
  $mutex=[Threading.Mutex]::new($false,('Local\XiaomuCodexSkin-Maintenance-'+$digest))
  $held=$false
  try{try{$held=$mutex.WaitOne($TimeoutMs)}catch [Threading.AbandonedMutexException]{$held=$true};if(-not $held){throw 'Skin maintenance is busy. Please retry shortly.'};return $mutex}catch{$mutex.Dispose();throw}
}
function Exit-XiaomuMaintenance($Mutex){if($Mutex){try{$Mutex.ReleaseMutex()}finally{$Mutex.Dispose()}}}

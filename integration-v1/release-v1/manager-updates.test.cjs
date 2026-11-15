'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const manager=path.join(__dirname,'control-center.ps1');
const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const setup=`$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput([IO.File]::ReadAllText(${quote(manager)},[Text.Encoding]::UTF8),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw ($parseErrors|Out-String)}
foreach($entry in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]},$true)){
 . ([scriptblock]::Create($entry.Extent.Text))
}
$controls=@{}
foreach($name in @('Runtime','InstallState','Dependencies','Compatibility','Modules','CheckedAt','Feedback','CurrentVersion','LatestVersion','UpdateStatus','Install','Start','Pause','Restore','Refresh','Package','CheckUpdate','DownloadUpdate')){
 $controls[$name]=[pscustomobject]@{Text=('before-'+$name);IsEnabled=$true}
}
$window=[pscustomobject]@{CloseCount=0}
$window|Add-Member ScriptMethod Close {$this.CloseCount++}
$root=${quote(__dirname)}
$script:packageSource=$root
$script:job=$null
$script:lastInstalled=$true
$script:lastCanStart=$true
$script:lastUpdate=$null
$script:lastUpdateResultUtc=$null
$script:managerStartUtc=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o')
function New-InspectResult([string]$Version='1.0.0'){
 [pscustomobject]@{ok=$true;installed=$true;integrity='verified';runtime='active';skinVersion=$Version;dependencies=[pscustomobject]@{ready=$true;nodeVersion='v22.0.0';issues=@()};compatibility='compatible';codexVersion='fixture';disabled=@();checkedAtUtc=[datetime]::UtcNow.ToString('o');detail='runtime-ok'}
}
function Get-TickBlock {
 $tick=$ast.Find({param($node) $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Expression.Extent.Text -eq '$timer' -and $node.Member.Value -eq 'Add_Tick'},$true)
 if(-not $tick){throw 'Missing manager timer'}
 $tick.Arguments[0].ScriptBlock.GetScriptBlock()
}
`;
function run(body,{initialize=true}={}){
 const script="$ProgressPreference='SilentlyContinue'\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\n"+(initialize?setup:'$ErrorActionPreference="Stop"\n')+body;
 const encoded=Buffer.from(script,'utf16le').toString('base64');
 return JSON.parse(execFileSync(shell,['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-OutputFormat','Text','-EncodedCommand',encoded],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024}).trim());
}

test('update controls load inside the existing scrollable WPF window without showing it',()=>{
 const source=fs.readFileSync(manager,'utf8');
 const match=source.match(/\$xml=@'\r?\n([\s\S]*?)\r?\n'@/);
 assert.ok(match,'manager XAML is available for isolated parsing');
 const result=run(`Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase
$xml=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(match[1]).toString('base64')}'))
$reader=New-Object System.Xml.XmlNodeReader ([xml]$xml)
$view=[Windows.Markup.XamlReader]::Load($reader)
$names=@('CurrentVersion','LatestVersion','UpdateStatus','CheckUpdate','DownloadUpdate')
[pscustomobject]@{controls=@($names|Where-Object {$null -ne $view.FindName($_)});scrollable=($view.Content -is [Windows.Controls.ScrollViewer]);downloadDisabled=($view.FindName('DownloadUpdate').IsEnabled -eq $false);visible=$view.IsVisible}|ConvertTo-Json -Compress`,{initialize:false});
 assert.deepEqual(result.controls,['CurrentVersion','LatestVersion','UpdateStatus','CheckUpdate','DownloadUpdate']);
 assert.equal(result.scrollable,true);assert.equal(result.downloadDisabled,true);assert.equal(result.visible,false);
});

test('update buttons dispatch only their explicit worker actions',()=>{
 const result=run(`$script:called=@()
function Invoke-ControlAction([string]$Action){$script:called+=,$Action}
foreach($name in @('CheckUpdate','DownloadUpdate')){
 $expected='$controls.'+$name
 $click=$ast.Find({param($node) $node -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $node.Expression.Extent.Text -eq $expected -and $node.Member.Value -eq 'Add_Click'},$true)
 if(-not $click){throw ('Missing update click action: '+$name)}
 & $click.Arguments[0].ScriptBlock.GetScriptBlock()
}
ConvertTo-Json -InputObject @($script:called) -Compress`);
 assert.deepEqual(result,['CheckUpdate','Update']);
});

test('a failed update check leaves healthy runtime and installed-module status intact',()=>{
 const result=run(`Set-ControlResult ([pscustomobject]@{ok=$false;kind='update';update=[pscustomobject]@{state='failed';currentVersion='1.0.0';latestVersion='';canUpdate=$false;message='fixture-network-unavailable'};closeManagerForUpdate=$false})
[pscustomobject]@{runtime=$controls.Runtime.Text;installation=$controls.InstallState.Text;dependencies=$controls.Dependencies.Text;compatibility=$controls.Compatibility.Text;modules=$controls.Modules.Text;feedback=$controls.Feedback.Text;status=$controls.UpdateStatus.Text;canDownload=$controls.DownloadUpdate.IsEnabled}|ConvertTo-Json -Compress`);
 for(const [key,name]of Object.entries({runtime:'Runtime',installation:'InstallState',dependencies:'Dependencies',compatibility:'Compatibility',modules:'Modules',feedback:'Feedback'}))assert.equal(result[key],'before-'+name);
 assert.match(result.status,/fixture-network-unavailable/);assert.equal(result.canDownload,false);
});

test('Inspect keeps the last update result while refreshing the trusted installed version',()=>{
 const result=run(`Set-ControlResult ([pscustomobject]@{ok=$true;kind='update';update=[pscustomobject]@{state='available';currentVersion='1.0.0';latestVersion='1.0.1';canUpdate=$true;message='fixture-update-ready'};closeManagerForUpdate=$false})
Set-ControlResult (New-InspectResult '1.0.1')
Set-ControlBusy $false
[pscustomobject]@{current=$controls.CurrentVersion.Text;latest=$controls.LatestVersion.Text;status=$controls.UpdateStatus.Text;canDownload=$controls.DownloadUpdate.IsEnabled;runtime=$controls.Runtime.Text}|ConvertTo-Json -Compress`);
 assert.match(result.current,/1\.0\.1/);assert.match(result.latest,/1\.0\.1/);assert.match(result.status,/fixture-update-ready/);
 assert.equal(result.canDownload,true);assert.equal(result.runtime,'小睦皮肤正在运行');
});

test('a same-version local-to-stable promotion remains available after Inspect',()=>{
 const result=run(`Set-ControlResult ([pscustomobject]@{ok=$true;kind='update';update=[pscustomobject]@{state='available';currentVersion='1.0.0';latestVersion='1.0.0';canUpdate=$true;message='fixture-stable-promotion'};closeManagerForUpdate=$false})
Set-ControlResult (New-InspectResult '1.0.0')
Set-ControlBusy $false
[pscustomobject]@{canDownload=$controls.DownloadUpdate.IsEnabled;status=$controls.UpdateStatus.Text}|ConvertTo-Json -Compress`);
 assert.equal(result.canDownload,true);assert.equal(result.status,'fixture-stable-promotion');
});

test('the last handoff result is shown once without replacing an explicit update check',()=>{
 const result=run(`$inspect=New-InspectResult
$handoff=[pscustomobject]@{schema=1;ok=$false;version='1.0.1';message='fixture-repair-failed-old-install-retained';atUtc='2026-11-15T01:00:00Z'}
$inspect|Add-Member NoteProperty updateResult $handoff
Set-ControlResult $inspect
$first=$controls.UpdateStatus.Text
$controls.UpdateStatus.Text='fixture-later-status'
Set-ControlResult $inspect
$same=$controls.UpdateStatus.Text
Set-ControlResult ([pscustomobject]@{ok=$true;kind='update';update=[pscustomobject]@{state='current';currentVersion='1.0.0';latestVersion='1.0.0';canUpdate=$false;message='fixture-explicit-check'};closeManagerForUpdate=$false})
$handoff.atUtc='2026-11-15T02:00:00Z'
Set-ControlResult $inspect
[pscustomobject]@{first=$first;same=$same;afterExplicit=$controls.UpdateStatus.Text;runtime=$controls.Runtime.Text;feedback=$controls.Feedback.Text}|ConvertTo-Json -Compress`);
 assert.match(result.first,/fixture-repair-failed-old-install-retained/);assert.equal(result.same,'fixture-later-status');assert.equal(result.afterExplicit,'fixture-explicit-check');
 assert.equal(result.runtime,'小睦皮肤正在运行');assert.equal(result.feedback,'runtime-ok');
});

test('busy jobs disable update actions and restore only the eligible actions',()=>{
 const result=run(`$script:lastUpdate=[pscustomobject]@{currentVersion='1.0.0';latestVersion='1.0.1';canUpdate=$true}
Set-ControlBusy $true
$during=@($controls.CheckUpdate.IsEnabled,$controls.DownloadUpdate.IsEnabled,$controls.Install.IsEnabled)
$script:lastInstalled=$false;$script:lastCanStart=$false
Set-ControlBusy $false
[pscustomobject]@{during=$during;after=@($controls.CheckUpdate.IsEnabled,$controls.DownloadUpdate.IsEnabled,$controls.Start.IsEnabled,$controls.Pause.IsEnabled,$controls.Restore.IsEnabled)}|ConvertTo-Json -Compress`);
 assert.deepEqual(result.during,[false,false,false]);assert.deepEqual(result.after,[true,false,false,false,false]);
});

test('only the Update action passes this exact manager lifetime to the worker',()=>{
 const result=run(`$update=New-ControlProcessInfo 'Update'
$check=New-ControlProcessInfo 'CheckUpdate'
[pscustomobject]@{update=$update.Arguments;check=$check.Arguments;pid=$PID;started=$script:managerStartUtc;hidden=$update.CreateNoWindow;noShell=(-not $update.UseShellExecute)}|ConvertTo-Json -Compress`);
 assert.ok(result.update.includes(' -ManagerPid '+result.pid));assert.ok(result.update.includes(' -ManagerStartUtc "'+result.started+'"'));
 assert.doesNotMatch(result.check,/-ManagerPid|-ManagerStartUtc/);assert.match(result.update,/-Action Update -PackageRoot /);
 assert.equal(result.hidden,true);assert.equal(result.noShell,true);
});

test('selecting an external repair package does not change the online updater manager identity',()=>{
 const result=run(`$script:packageSource=Join-Path $root 'fixture-external-package'
$actions=@{}
foreach($action in @('CheckUpdate','Update','Install','Restore')){$actions[$action]=(New-ControlProcessInfo $action).Arguments}
[pscustomobject]@{root=$root;selected=$script:packageSource;actions=$actions}|ConvertTo-Json -Compress`);
 for(const action of ['CheckUpdate','Update'])assert.ok(result.actions[action].includes(' -PackageRoot "'+result.root+'"'),action+' must bind the running manager source');
 for(const action of ['Install','Restore'])assert.ok(result.actions[action].includes(' -PackageRoot "'+result.selected+'"'),action+' must retain the user-selected repair package');
});

test('the manager closes only after a successful update handoff asks it to close',()=>{
 const result=run(`$update=[pscustomobject]@{state='ready';currentVersion='1.0.0';latestVersion='1.0.1';canUpdate=$true;message='fixture-ready'}
Set-ControlResult ([pscustomobject]@{ok=$true;kind='update';update=$update;closeManagerForUpdate=$false})
$before=$window.CloseCount
Set-ControlResult ([pscustomobject]@{ok=$false;kind='update';update=$update;closeManagerForUpdate=$true})
$failed=$window.CloseCount
Set-ControlResult ([pscustomobject]@{ok=$true;kind='update';update=$update;closeManagerForUpdate=$true})
[pscustomobject]@{before=$before;failed=$failed;after=$window.CloseCount}|ConvertTo-Json -Compress`);
 assert.deepEqual(result,{before:0,failed:0,after:1});
});

test('the idle timer performs Inspect, never a network update check',()=>{
 const result=run(`$script:nextCheck=[datetime]::UtcNow.AddSeconds(-1)
$script:called=@()
function Invoke-ControlAction([string]$Action){$script:called+=,$Action}
& (Get-TickBlock)
ConvertTo-Json -InputObject @($script:called) -Compress`);
 assert.deepEqual(result,['Inspect']);
 const source=fs.readFileSync(manager,'utf8');
 assert.doesNotMatch(source,/Invoke-(?:WebRequest|RestMethod)|api\.github\.com|WebClient|HttpClient|DownloadString|DownloadFile/);
});

test('invalid update-worker output is reported separately from skin runtime',()=>{
 const result=run(`$process=[pscustomobject]@{HasExited=$true;Disposed=$false}
$process|Add-Member ScriptMethod Dispose {$this.Disposed=$true}
function New-FixtureTask([string]$Value){
 $task=[pscustomobject]@{Value=$Value}
 $task|Add-Member ScriptMethod GetAwaiter {return $this}
 $task|Add-Member ScriptMethod GetResult {return $this.Value}
 return $task
}
$script:job=@{process=$process;output=(New-FixtureTask '{invalid');error=(New-FixtureTask '');started=[datetime]::UtcNow;action='CheckUpdate'}
& (Get-TickBlock)
[pscustomobject]@{runtime=$controls.Runtime.Text;status=$controls.UpdateStatus.Text;jobCleared=($null -eq $script:job);disposed=$process.Disposed;checkEnabled=$controls.CheckUpdate.IsEnabled}|ConvertTo-Json -Compress`);
 assert.equal(result.runtime,'before-Runtime');assert.match(result.status,/更新/);assert.equal(result.jobCleared,true);assert.equal(result.disposed,true);assert.equal(result.checkEnabled,true);
});

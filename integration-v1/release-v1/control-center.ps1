[CmdletBinding()]
param([switch]$CheckUi)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName PresentationFramework,PresentationCore,WindowsBase,System.Windows.Forms
$root=$PSScriptRoot
$installedRoot=Join-Path $env:LOCALAPPDATA 'XiaomuCodexSkin\1.0.0'
$xml=@'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" Title="小睦 Codex · 皮肤管理" Width="680" Height="700" MinWidth="540" MinHeight="520" WindowStartupLocation="CenterScreen" Background="#F4F7EE" FontFamily="Microsoft YaHei UI" FontSize="14" Foreground="#2E4939">
 <Window.Resources>
  <Style TargetType="Button"><Setter Property="Background" Value="#E3ECD9"/><Setter Property="Foreground" Value="#2E4939"/><Setter Property="BorderBrush" Value="#B7CAA9"/><Setter Property="Padding" Value="14,10"/><Setter Property="Margin" Value="0,0,10,10"/><Setter Property="Cursor" Value="Hand"/><Setter Property="MinHeight" Value="42"/>
   <Setter Property="Template"><Setter.Value><ControlTemplate TargetType="Button"><Border x:Name="Box" Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="1" CornerRadius="9" Padding="{TemplateBinding Padding}"><ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border><ControlTemplate.Triggers><Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Box" Property="Background" Value="#D6E5C9"/></Trigger><Trigger Property="IsKeyboardFocused" Value="True"><Setter TargetName="Box" Property="BorderBrush" Value="#48694E"/><Setter TargetName="Box" Property="BorderThickness" Value="2"/></Trigger><Trigger Property="IsEnabled" Value="False"><Setter TargetName="Box" Property="Opacity" Value="0.45"/></Trigger></ControlTemplate.Triggers></ControlTemplate></Setter.Value></Setter>
  </Style>
 </Window.Resources>
 <ScrollViewer VerticalScrollBarVisibility="Auto" HorizontalScrollBarVisibility="Disabled">
 <StackPanel Margin="28,24">
  <DockPanel Margin="0,0,0,20"><Image x:Name="Portrait" Width="65" Height="72" Stretch="Uniform" Margin="0,0,18,0" DockPanel.Dock="Left"/><StackPanel VerticalAlignment="Center"><TextBlock Text="小睦 Codex" FontSize="25" FontWeight="SemiBold"/><TextBlock Text="皮肤管理 · 按自己的习惯来。" Foreground="#526B50" Margin="0,5,0,0"/></StackPanel></DockPanel>
  <Border CornerRadius="12" Background="#FFFEF9" BorderBrush="#CCD9C2" BorderThickness="1" Padding="18" Margin="0,0,0,18"><StackPanel>
   <TextBlock x:Name="Runtime" Text="正在读取运行状态…" FontSize="18" FontWeight="SemiBold" TextWrapping="Wrap"/>
   <TextBlock x:Name="InstallState" Text="安装：检查中" Margin="0,12,0,0" TextWrapping="Wrap"/>
   <TextBlock x:Name="Compatibility" Text="兼容：尚未检测" Margin="0,6,0,0" TextWrapping="Wrap"/>
   <TextBlock x:Name="Modules" Text="" Margin="0,6,0,0" TextWrapping="Wrap"/>
   <TextBlock x:Name="Dependencies" Text="依赖：检测中" Margin="0,6,0,0" TextWrapping="Wrap"/>
   <TextBlock x:Name="CheckedAt" Text="" Foreground="#526B50" FontSize="12" Margin="0,12,0,0"/>
  </StackPanel></Border>
  <WrapPanel><Button x:Name="Install" Content="安装 / 修复"/><Button x:Name="Start" Content="启动 / 继续"/><Button x:Name="Pause" Content="暂停皮肤"/><Button x:Name="Restore" Content="恢复官方外观"/><Button x:Name="Refresh" Content="重新检测"/><Button x:Name="Package" Content="选择完整安装包"/></WrapPanel>
  <TextBlock x:Name="SourceLabel" Text="" TextWrapping="Wrap" FontSize="12" Margin="0,0,0,8"/>
  <TextBlock Text="暂停只停止当前皮肤会话；恢复还会还原受管启动入口。两者都不会关闭 Codex。" TextWrapping="Wrap" Foreground="#526B50" FontSize="13" Margin="0,3,0,12"/>
  <Border Background="#EAF1E3" CornerRadius="9" Padding="12"><TextBlock x:Name="Feedback" Text="正在检查。" TextWrapping="Wrap"/></Border>
  <TextBlock Text="浅绿皮肤需要 Codex 原生浅色主题。若官方更新导致组件不兼容，将保留原界面并显示原因。当前依赖本机 Node.js。" TextWrapping="Wrap" Foreground="#526B50" FontSize="12" Margin="0,15,0,0"/>
 </StackPanel></ScrollViewer>
</Window>
'@
$reader=New-Object System.Xml.XmlNodeReader ([xml]$xml)
$window=[Windows.Markup.XamlReader]::Load($reader)
$controls=@{}
foreach($name in @('Portrait','Runtime','InstallState','Compatibility','Modules','Dependencies','CheckedAt','Install','Start','Pause','Restore','Refresh','Package','SourceLabel','Feedback')){$controls[$name]=$window.FindName($name)}
$art=Join-Path $root 'manager-portrait.png'
if(Test-Path -LiteralPath $art){$controls.Portrait.Source=[Windows.Media.Imaging.BitmapImage]::new([uri]$art)}
if($CheckUi){[ordered]@{loaded=$true;controls=$controls.Count;title=$window.Title}|ConvertTo-Json;return}
if(-not $XiaomuControlWorkerSha256){throw '请使用 manage.vbs 打开经过校验的管理程序。'}
$script:expectedWorkerHash=[string]$XiaomuControlWorkerSha256
$created=$false;$mutex=[Threading.Mutex]::new($true,'Local\XiaomuCodexSkin-ControlCenter',[ref]$created)
if(-not $created){$mutex.Dispose();return}
$script:job=$null;$script:nextCheck=[datetime]::UtcNow
$script:lastInstalled=$false
$script:lastCanStart=$false
$script:packageSource=$root
$controls.SourceLabel.Text='安装包：'+$script:packageSource
function Set-ControlResult($result) {
  if(-not $result.ok){$controls.Runtime.Text='需要检查';$controls.Feedback.Text=[string]$result.message;return}
  $script:lastInstalled=[bool]$result.installed
  $script:lastCanStart=$result.installed -and $result.integrity -eq 'verified' -and $result.dependencies.ready
  $labels=@{active='小睦皮肤正在运行';paused='皮肤已暂停';restored='已恢复官方外观';stopping='正在暂停皮肤';stopped='皮肤未运行';checking='正在确认运行状态';'not-installed'='尚未安装';'waiting-for-client-exit'='等待 Codex 正常退出';'manual-relaunch-required'='需要重新打开小睦 Codex';'retrying-endpoint'='正在恢复连接';'retrying-identity'='正在重新验证身份';'waiting-for-native-workspace'='等待可用的 Codex 页面'}
  $controls.Runtime.Text=if($labels.ContainsKey([string]$result.runtime)){$labels[[string]$result.runtime]}else{'皮肤状态：'+$result.runtime}
  $controls.InstallState.Text=if($result.integrity -eq 'damaged'){'安装：文件损坏，需要完整安装包修复'}elseif($result.installed){'安装：小睦皮肤 '+$result.skinVersion+' · 文件校验通过'}else{'安装：尚未安装'}
  $controls.Dependencies.Text=if($result.dependencies.ready){'依赖：Node.js '+$result.dependencies.nodeVersion+' · 官方 Codex 已找到'}else{'依赖待处理：'+($result.dependencies.issues -join ' ')}
  $compat=@{compatible='兼容';partial='部分兼容';unsupported='暂不支持';unknown='未能确认'}
  $value=[string]$result.compatibility
  $compatLabel=if($compat.ContainsKey($value)){$compat[$value]}else{$value}
  $controls.Compatibility.Text='Codex：'+$(if($result.codexVersion){$result.codexVersion}else{'未确认版本'})+' · '+$compatLabel
  $names=@{core='基础界面';sidebar='侧栏';pages='页面装饰';panels='终端与文件';overlays='搜索与弹窗';contextMenus='右键菜单'}
  $disabled=@($result.disabled|Where-Object {$_})
  $controls.Modules.Text=if($disabled.Count){'暂时停用：'+(($disabled|ForEach-Object {if($names.ContainsKey($_)){$names[$_]}else{$_}})-join '、')}elseif($result.compatibility -eq 'compatible'){'已识别的皮肤模块均可加载'}else{'兼容结果未确认，不能保证皮肤可加载'}
  $controls.CheckedAt.Text='最近检测：'+([datetime]::Parse($result.checkedAtUtc).ToLocalTime().ToString('HH:mm:ss'))
  $controls.Feedback.Text=if($result.detail){$result.detail}elseif($result.message){$result.message}else{'状态已更新。'}
}
function Invoke-ControlAction([string]$Action) {
  if($script:job){return}
  $workerValid=$false
  $sha=[Security.Cryptography.SHA256]::Create()
  try{$actualHash=[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes((Join-Path $root 'control-actions.ps1')))).Replace('-','');$workerValid=$actualHash -ieq $script:expectedWorkerHash}catch{}finally{$sha.Dispose()}
  if(-not $workerValid){$controls.Feedback.Text='管理组件已损坏，未执行。请关闭此窗口，从另一份完整安装包打开 manage.vbs 修复或恢复。';$controls.Start.IsEnabled=$false;$script:nextCheck=[datetime]::UtcNow.AddSeconds(30);return}
  foreach($name in @('Install','Start','Pause','Restore','Refresh','Package')){$controls[$name].IsEnabled=$false}
  $controls.Feedback.Text='正在处理，请稍等。'
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $info.Arguments='-NoProfile -ExecutionPolicy Bypass -File "'+(Join-Path $root 'control-actions.ps1')+'" -Action '+$Action+' -PackageRoot "'+$script:packageSource+'"'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $info.StandardOutputEncoding=[Text.Encoding]::UTF8;$info.StandardErrorEncoding=[Text.Encoding]::UTF8
  try{
    $process=[Diagnostics.Process]::new();$process.StartInfo=$info;$null=$process.Start()
    $script:job=@{process=$process;output=$process.StandardOutput.ReadToEndAsync();error=$process.StandardError.ReadToEndAsync();started=[datetime]::UtcNow;action=$Action}
  }catch{$controls.Feedback.Text='操作未启动：'+$_.Exception.Message;foreach($name in @('Install','Start','Pause','Restore','Refresh','Package')){$controls[$name].IsEnabled=$true}}
}
$controls.Install.Add_Click({Invoke-ControlAction 'Install'})
$controls.Start.Add_Click({Invoke-ControlAction 'Start'})
$controls.Pause.Add_Click({Invoke-ControlAction 'Pause'})
$controls.Restore.Add_Click({Invoke-ControlAction 'Restore'})
$controls.Refresh.Add_Click({Invoke-ControlAction 'Inspect'})
$controls.Package.Add_Click({
  $dialog=[Windows.Forms.FolderBrowserDialog]::new();$dialog.Description='选择重新解压的完整小睦皮肤安装包（包含 manifest.json）';$dialog.ShowNewFolderButton=$false
  try{if($dialog.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){$script:packageSource=$dialog.SelectedPath;$controls.SourceLabel.Text='安装包：'+$script:packageSource;$controls.Feedback.Text='已选择安装包。点击安装 / 修复，或恢复官方外观；执行前会完整校验。'}}finally{$dialog.Dispose()}
})
$timer=[Windows.Threading.DispatcherTimer]::new();$timer.Interval=[timespan]::FromMilliseconds(500)
$timer.Add_Tick({
  if($script:job){
    if(-not $script:job.process.HasExited){
      if(([datetime]::UtcNow-$script:job.started).TotalSeconds -gt 45){$controls.Feedback.Text='仍在等待操作完成，未强制终止进程。'}
      return
    }
    try{
      $text=$script:job.output.GetAwaiter().GetResult()
      $errorText=$script:job.error.GetAwaiter().GetResult()
      if(-not $text.Trim()){throw $(if($errorText){$errorText.Substring(0,[Math]::Min(500,$errorText.Length))}else{'操作没有返回状态。'})}
      Set-ControlResult ($text|ConvertFrom-Json)
    }catch{$controls.Runtime.Text='需要检查';$controls.Feedback.Text='操作结果未确认：'+$_.Exception.Message}
    finally{$delay=if($script:job.action -eq 'Start'){2}else{30};$script:job.process.Dispose();$script:job=$null;$script:nextCheck=[datetime]::UtcNow.AddSeconds($delay);foreach($name in @('Install','Start','Pause','Restore','Refresh','Package')){$controls[$name].IsEnabled=$true};foreach($name in @('Pause','Restore')){$controls[$name].IsEnabled=$script:lastInstalled};$controls.Start.IsEnabled=$script:lastCanStart}
  }elseif([datetime]::UtcNow -ge $script:nextCheck){Invoke-ControlAction 'Inspect'}
})
$window.Add_Closed({$timer.Stop();if($script:job){$script:job.process.Dispose()};$mutex.ReleaseMutex();$mutex.Dispose()})
$timer.Start();$null=$window.ShowDialog()

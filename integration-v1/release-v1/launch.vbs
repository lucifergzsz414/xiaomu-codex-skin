Option Explicit
Dim shell, fso, root, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
command = """" & shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"" -NoProfile -ExecutionPolicy Bypass -File """ & root & "\manager.ps1"" -Mode Start"
If WScript.Arguments.Count > 0 Then
  If WScript.Arguments(0) = "inspect" Then
    WScript.Echo command
    WScript.Quit 0
  End If
End If
shell.Run command, 0, False

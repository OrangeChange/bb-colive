Option Explicit

Dim shell, fso, projectRoot, scriptPath, powershell, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
scriptPath = fso.BuildPath(projectRoot, "scripts\start-dev-detached.ps1")
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If WScript.Arguments.Count > 0 And LCase(WScript.Arguments(0)) = "--worker" Then
  command = Chr(34) & powershell & Chr(34) & " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & scriptPath & Chr(34) & " -Worker"
  shell.Run command, 0, False
  WScript.Quit 0
End If

command = Chr(34) & powershell & Chr(34) & " -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & scriptPath & Chr(34)

' Window style 0 prevents a console window; False returns immediately to the caller.
shell.Run command, 0, False

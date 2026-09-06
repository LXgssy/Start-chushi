' ChuShi bridge launcher (embedded edition, ASCII only)
' Spawned by the ChuShi Lyric Source plugin and by the Run-key autostart.
Set sh = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir0 = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir0 & "\chushi-bridge.ps1"
If fso.FileExists(ps1) Then
  cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
  sh.Run cmd, 0, False
End If

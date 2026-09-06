' ChuShi SMTC bridge hidden launcher (pure ASCII, CRLF)
' Launched by the Run-key autostart entry; runs the bridge with NO window.
Set sh = CreateObject("Wscript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir0 = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir0 & "\ChuShi-SMTC-Bridge.ps1"
If fso.FileExists(ps1) Then
  cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
  sh.Run cmd, 0, False
End If

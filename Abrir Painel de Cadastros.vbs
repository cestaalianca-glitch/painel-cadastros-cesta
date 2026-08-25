Set objFSO = CreateObject("Scripting.FileSystemObject")
pasta = objFSO.GetParentFolderName(WScript.ScriptFullName)
Set objShell = CreateObject("WScript.Shell")
comando = "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\servidor.ps1"""
objShell.Run comando, 0, False

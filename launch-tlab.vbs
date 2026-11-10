Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run chr(34) & strPath & "\start-tlab-production.bat" & chr(34), 1, False
Set WshShell = Nothing

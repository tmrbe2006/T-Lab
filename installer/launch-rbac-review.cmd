@echo off
setlocal
cd /d "%~dp0"
title T-Lab RBAC Review - Local Evaluation
if not exist ".env" (
  >".env" echo # Local evaluation only - configure MYSQL credentials before using MySQL
  >>".env" echo PORT=3007
  >>".env" echo HOST=127.0.0.1
  >>".env" echo NODE_ENV=production
  >>".env" echo MYSQL_HOST=127.0.0.1
  >>".env" echo MYSQL_PORT=3306
  >>".env" echo MYSQL_USER=root
  >>".env" echo MYSQL_PASSWORD=
  >>".env" echo MYSQL_DATABASE=tlab_db
  >>".env" echo MYSQL_AUTO_SYNC=false
)
echo Launching local T-Lab review server.
echo If port 3007 is in use, stop the conflicting server first.
echo Database import, deletion and automatic synchronization are not part of this installer.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 40; $i++) { Start-Sleep -Seconds 1; try { $t=New-Object Net.Sockets.TcpClient('127.0.0.1',3007); $t.Close(); Start-Process 'http://localhost:3007'; break } catch {} }"
".\node.exe" --import tsx server.ts --static-dist
echo T-Lab server has stopped.
pause

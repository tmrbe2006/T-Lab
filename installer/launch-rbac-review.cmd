@echo off
setlocal
cd /d "%~dp0"
title T-Lab RBAC Review - Windows
set "APP_PORT=3117"
if not exist ".env" (
  >".env" echo # Independent review installation. No existing MySQL database is modified by setup.
  >>".env" echo PORT=3117
  >>".env" echo HOST=127.0.0.1
  >>".env" echo NODE_ENV=production
  >>".env" echo MYSQL_HOST=127.0.0.1
  >>".env" echo MYSQL_PORT=3306
  >>".env" echo MYSQL_USER=root
  >>".env" echo MYSQL_PASSWORD=
  >>".env" echo MYSQL_DATABASE=tlab_rbac_review
  >>".env" echo MYSQL_AUTO_SYNC=false
)
if not exist "node.exe" (
  echo ERROR: The bundled node.exe was not found.
  pause
  exit /b 1
)
if not exist "dist\index.html" (
  echo ERROR: The bundled application UI is missing.
  pause
  exit /b 1
)
if not exist "node_modules\tsx\dist\cli.mjs" (
  echo ERROR: The bundled TypeScript runtime is missing.
  pause
  exit /b 1
)
echo ================================================
echo T-Lab RBAC Review - http://127.0.0.1:%APP_PORT%
echo ================================================
echo Local diagnostic log: "%~dp0tlab-launch.log"
echo This edition does NOT import or delete databases.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "for ($i=0; $i -lt 45; $i++) { Start-Sleep -Seconds 1; try { $r=Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3117/'; if($r.StatusCode -eq 200 -and $r.Content -match 'html') { Start-Process 'http://127.0.0.1:3117/'; break } } catch {} }"
echo Starting server. Keep this window open while using the review version.
".\node.exe" --import tsx server.ts --static-dist --port %APP_PORT% >"tlab-launch.log" 2>&1
set "CODE=%ERRORLEVEL%"
type "tlab-launch.log"
echo.
echo The T-Lab server stopped with exit code %CODE%.
echo If the application did not open, send tlab-launch.log.
pause
exit /b %CODE%

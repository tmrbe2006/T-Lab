@echo off
chcp 65001 >nul
title T-Lab Medical Laboratory ^& ERP Server
cd /d "%~dp0"

:: Ensure Node.js and NPM are in PATH even when launched from Inno Setup or Desktop Shortcut
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs"

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
  )
)

:: Read PORT from .env using findstr (immune to encoding/ANSI comments)
set APP_PORT=3007
if exist ".env" (
  for /f "tokens=2 delims==" %%a in ('findstr /B /I "PORT=" ".env" 2^>nul') do (
    set "APP_PORT=%%a"
  )
)
set "APP_PORT=%APP_PORT: =%"
if "%APP_PORT%"=="" set APP_PORT=3007

echo ============================================================================
echo   T-Lab Medical Laboratory ^& ERP System (MySQL 5.5 / 8.0.28)
echo   Working Directory: %CD%
echo   Target URL       : http://localhost:%APP_PORT%
echo ============================================================================
echo.

:: Verify Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo [ERROR] Node.js was not found on this computer!
  echo Please install Node.js LTS from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

:: Install node_modules automatically if missing (e.g. when installed from a clean ZIP)
if not exist "node_modules\express\package.json" (
  echo [1/2] Installing required packages ^(node_modules^) for first-time launch...
  call npm install --legacy-peer-deps
  echo.
)

if not exist "node_modules\tsx\dist\cli.mjs" (
  echo [1/2] Installing tsx runtime...
  call npm install --legacy-peer-deps
  echo.
)

:: Remove any stale Vite cache copied from another folder
if exist "node_modules\.vite" (
  rmdir /s /q "node_modules\.vite" >nul 2>&1
)

:: Wait in background until TCP port %APP_PORT% is actively listening, then open browser
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for($i=0; $i -lt 30; $i++){ Start-Sleep -Seconds 1; try { $c = New-Object System.Net.Sockets.TcpClient('127.0.0.1', %APP_PORT%); if($c.Connected){ $c.Close(); Start-Process 'http://localhost:%APP_PORT%'; break } } catch {} }"

:: Start Server directly via node + tsx cli.mjs (works 100% offline & handles spaces in path)
set NODE_ENV=development
if exist "node_modules\tsx\dist\cli.mjs" (
  node "node_modules\tsx\dist\cli.mjs" server.ts --port %APP_PORT%
) else (
  call npx tsx server.ts --port %APP_PORT%
)

echo.
echo [INFO] Server process exited. Press any key to close this window...
pause

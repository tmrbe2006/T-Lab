@echo off
chcp 65001 >nul
title T-Lab Medical Laboratory Server Launcher
cd /d "%~dp0"

:: Ensure Node.js and NPM are in PATH
set "PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs;%APPDATA%\npm;%LOCALAPPDATA%\Programs\nodejs"

echo ============================================================================
echo   T-Lab Medical Laboratory ^& ERP System - Windows Port Selector
echo ============================================================================
echo.
if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
    echo [OK] Created .env file from .env.example
  )
)

if not exist "node_modules\express\package.json" (
  echo [INFO] Installing required Node.js packages...
  call npm install --legacy-peer-deps
)

set /p USER_PORT="Enter Port Number to run T-Lab on (Press Enter for default from .env / 3007): "
if "%USER_PORT%"=="" (
  echo.
  echo Starting T-Lab Server using .env configuration...
  echo.
  call start-tlab-production.bat
) else (
  echo.
  echo Starting T-Lab Server on http://localhost:%USER_PORT% ...
  echo.
  set PORT=%USER_PORT%
  if exist "node_modules\tsx\dist\cli.mjs" (
    node "node_modules\tsx\dist\cli.mjs" server.ts --port %USER_PORT% --open-browser
  ) else (
    call npx tsx server.ts --port %USER_PORT% --open-browser
  )
  pause
)

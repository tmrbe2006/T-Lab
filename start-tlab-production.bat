@echo off
chcp 65001 >nul
title T-Lab Medical Laboratory & ERP Server
cd /d "%~dp0"

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
  )
)

:: Read PORT from .env if available
set APP_PORT=3000
if exist .env (
  for /f "tokens=1,2 delims==" %%a in (.env) do (
    if "%%a"=="PORT" set APP_PORT=%%b
  )
)

echo ============================================================================
echo   T-Lab Medical Laboratory & ERP System (MySQL 5.5 / 8.0.28)
echo   Running on: http://localhost:%APP_PORT%
echo ============================================================================
echo.

:: Open browser automatically after 2 seconds in background
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%APP_PORT%"

:: Start Server directly from current source files so updates and .env changes take effect immediately
set NODE_ENV=development
npx tsx server.ts --port %APP_PORT%
pause


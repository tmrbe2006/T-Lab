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

:: Start Server (uses production dist if built, otherwise dev mode)
if exist "dist\index.html" (
  set NODE_ENV=production
  npx tsx server.ts --port %APP_PORT%
) else (
  npm run dev -- --port %APP_PORT%
)
pause

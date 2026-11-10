@echo off
chcp 65001 >nul
title T-Lab Medical Laboratory Server Launcher
echo ============================================================================
echo   T-Lab Medical Laboratory & ERP System - Windows Port Selector
echo ============================================================================
echo.
if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo [OK] Created .env file from .env.example
  )
)
set /p USER_PORT="Enter Port Number to run T-Lab on (Press Enter for default from .env / 3000): "
if "%USER_PORT%"=="" (
  echo.
  echo Starting T-Lab Server using .env configuration...
  echo.
  npm run dev
) else (
  echo.
  echo Starting T-Lab Server on http://localhost:%USER_PORT% ...
  echo.
  set PORT=%USER_PORT%
  npm run dev -- --port %USER_PORT%
)
pause

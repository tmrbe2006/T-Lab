@echo off
chcp 65001 >nul
title T-Lab Medical Laboratory Server Launcher
echo ============================================================================
echo   T-Lab Medical Laboratory & ERP System - Windows Port Selector
echo ============================================================================
echo.
set /p USER_PORT="Enter Port Number to run T-Lab on (Press Enter for default 3000): "
if "%USER_PORT%"=="" set USER_PORT=3000

echo.
echo Starting T-Lab Server on http://localhost:%USER_PORT% ...
echo.
set PORT=%USER_PORT%
npm run dev -- --port %USER_PORT%
pause

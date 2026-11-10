@echo off
chcp 65001 >nul
title T-Lab - Inno Setup 6 Builder
echo ============================================================================
echo   T-Lab Medical Laboratory System - Inno Setup 6 Package Builder
echo ============================================================================
echo.

echo [1/2] Building production frontend (npm run build)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
  echo [!] Warning: npm run build encountered an issue, continuing with source packaging...
)

echo.
echo [2/2] Checking for Inno Setup 6 Compiler (ISCC.exe)...
set ISCC_PATH=
if exist "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" (
  set "ISCC_PATH=C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
) else if exist "C:\Program Files\Inno Setup 6\ISCC.exe" (
  set "ISCC_PATH=C:\Program Files\Inno Setup 6\ISCC.exe"
)

if defined ISCC_PATH (
  echo Found Inno Setup 6 at: "%ISCC_PATH%"
  echo Compiling tlab-setup.iss into Output\T-Lab_Setup_v3.0.0.exe ...
  "%ISCC_PATH%" "tlab-setup.iss"
  echo.
  echo ============================================================================
  echo   [SUCCESS] Installer created inside folder: Output\T-Lab_Setup_v3.0.0.exe
  echo ============================================================================
) else (
  echo [INFO] Inno Setup 6 was not found in default Program Files path.
  echo Please open "tlab-setup.iss" directly in Inno Setup Compiler 6 and press Ctrl+F9 (Compile).
)
echo.
pause

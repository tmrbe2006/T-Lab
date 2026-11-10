@echo off
chcp 65001 >nul
echo Stopping T-Lab Server...
taskkill /F /IM node.exe >nul 2>&1
echo [OK] T-Lab Server stopped successfully.
timeout /t 2 >nul

@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-server-plugin.ps1"
if errorlevel 1 (
  echo.
  echo Uninstallation failed. See the error above.
  pause
  exit /b 1
)
echo.
pause

@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-server-plugin.ps1"
if errorlevel 1 (
  echo.
  echo Installation failed. See the error above.
  pause
  exit /b 1
)
echo.
pause

@echo off
rem TokenCal helper - manual start (keeps a console window open for troubleshooting).
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" "%~dp0tokencal-helper.js"
  ) else (
    echo.
    echo [x] Node.js not found - install it from https://nodejs.org/ first
    echo.
  )
) else (
  node "%~dp0tokencal-helper.js"
)
pause

@echo off
chcp 65001 >nul
rem TokenCal - helper health check (just double-click this file)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    "C:\Program Files\nodejs\node.exe" "tests\check-installed-helper.mjs"
  ) else (
    echo.
    echo [x] Node.js not found - install it from https://nodejs.org/
    echo.
  )
) else (
  node "tests\check-installed-helper.mjs"
)
echo.
pause

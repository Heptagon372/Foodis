@echo off
rem FOODIS dev console - double-click to start the dev server with the FOODIS CLI.
rem (ASCII only: cmd.exe can mis-read non-ASCII text in .bat files. The CLI itself is Korean.)
chcp 65001 >nul
title FOODIS
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [FOODIS] Node.js is required: https://nodejs.org
  pause
  exit /b 1
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [FOODIS] pnpm not found. Enabling via corepack...
  call corepack enable
)

node "tools\cli\foodis.mjs" %*
if errorlevel 1 pause

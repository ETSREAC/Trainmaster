@echo off
setlocal enabledelayedexpansion
title TrainMaster - Model Railway Control
cd /d "%~dp0"

echo.
echo ========================================================
echo   Starting TrainMaster (Server + Web Client)
echo ========================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] Node.js ist nicht installiert oder nicht im PATH!
    echo Bitte installiere Node.js (Version 18 oder neuer) von https://nodejs.org
    echo.
    pause
    exit /b 1
)

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [FEHLER] npm wurde nicht gefunden!
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] Erste Ausfuehrung: Installiere Abhaengigkeiten...
    call npm install
    if %errorlevel% neq 0 (
        echo [FEHLER] Fehler bei der Installation der Abhaengigkeiten!
        pause
        exit /b 1
    )
)

node scripts/start.mjs
if %errorlevel% neq 0 (
    echo.
    echo [INFO] TrainMaster wurde beendet.
    pause
)

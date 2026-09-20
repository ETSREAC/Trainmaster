@echo off
title TrainMaster - Stream Deck Plugin Installer
cd /d "%~dp0"
node scripts/install_streamdeck_plugin.mjs
echo.
pause

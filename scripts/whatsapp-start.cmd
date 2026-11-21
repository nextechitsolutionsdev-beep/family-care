@echo off
rem Starts OpenWA and the WhatsApp worker (npm run whatsapp) from the project folder.
rem Used by the Windows startup shortcut «Family Care WhatsApp»; closing this window stops sending.
title Family Care WhatsApp
cd /d "%~dp0.."
npm run whatsapp

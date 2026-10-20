@echo off
title Grayxon - Prueba local LiveKit
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
  echo No se encontro Python Launcher (py).
  echo Instala Python 3 desde https://www.python.org/downloads/windows/ y marca "Add Python to PATH".
  pause
  exit /b 1
)
start "" http://127.0.0.1:8765/livekit-local-test.html
py -m http.server 8765 --bind 127.0.0.1
pause

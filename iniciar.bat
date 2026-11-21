@echo off
title Loyalty Nails App - Servidor
chcp 65001 > nul
cls
echo ========================================================
echo        💅 LOYALTY NAILS - APP DE FIDELIDAD
echo ========================================================
echo.
echo Iniciando servidor en el puerto 3000...
echo.
echo Abre tu navegador en:
echo    👉 Panel Manicurista: http://localhost:3000/admin.html
echo    👉 Pagina Principal:  http://localhost:3000
echo.
echo Presiona Ctrl + C para detener el servidor.
echo ========================================================
echo.
node server.js
pause

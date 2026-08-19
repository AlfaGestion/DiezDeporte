@echo off
setlocal

rem ============================================================
rem  Subir imagenes de productos al FTP.
rem  Edita las lineas de abajo con la carpeta y listo.
rem ============================================================

set "SOURCE_FOLDER=C:\ruta\a\tus\imagenes"

set "FTP_HOST=alfanet.ddns.net"
set "FTP_PORT=21"
set "FTP_USER=ftpalfa"
set "FTP_PASSWORD=24681012"
set "FTP_REMOTE_DIR=Clientes/112010732/IMAGENES"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0product-images-ftp-sync.ps1" -Mode all

echo.
pause
exit /b

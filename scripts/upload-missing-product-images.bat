@echo off
setlocal

rem ============================================================
rem  Subir SOLO las imagenes que todavia no estan en el FTP.
rem  Compara la carpeta local contra el listado remoto y salta
rem  las que ya existen (y las que empiezan con tmp_).
rem  Edita las lineas de abajo con la carpeta y listo.
rem ============================================================

set "SOURCE_FOLDER=C:\ruta\a\tus\imagenes"

set "FTP_HOST=alfanet.ddns.net"
set "FTP_PORT=21"
set "FTP_USER=ftpalfa"
set "FTP_PASSWORD=24681012"
set "FTP_REMOTE_DIR=Clientes/112010732/IMAGENES"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0product-images-ftp-sync.ps1" -Mode missing

echo.
pause
exit /b

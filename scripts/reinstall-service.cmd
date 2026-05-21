@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "INSTALL_DEPS=%SCRIPT_DIR%install-deps.cmd"
set "REMOVE_SERVICE_PS1=%SCRIPT_DIR%remove-service.ps1"
set "INSTALL_SERVICE_PS1=%SCRIPT_DIR%install-service.ps1"

if not exist "%INSTALL_DEPS%" (
  echo [ERROR] No existe: %INSTALL_DEPS%
  exit /b 1
)

if not exist "%INSTALL_SERVICE_PS1%" (
  echo [ERROR] No existe: %INSTALL_SERVICE_PS1%
  exit /b 1
)

echo [INFO] Paso 1/3 - Instalando dependencias...
call "%INSTALL_DEPS%"
if errorlevel 1 (
  echo [ERROR] Fallo instalacion de dependencias.
  exit /b 1
)

if exist "%REMOVE_SERVICE_PS1%" (
  echo [INFO] Paso 2/3 - Eliminando servicio previo (si existe)...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%REMOVE_SERVICE_PS1%"
  if errorlevel 1 (
    echo [ERROR] Fallo al eliminar servicio previo.
    exit /b 1
  )
) else (
  echo [INFO] Paso 2/3 - Script remove-service.ps1 no encontrado, se omite.
)

echo [INFO] Paso 3/3 - Instalando y arrancando servicio...
powershell -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SERVICE_PS1%"
if errorlevel 1 (
  echo [ERROR] Fallo al instalar/iniciar el servicio.
  exit /b 1
)

echo [OK] Reinstalacion completada.
exit /b 0

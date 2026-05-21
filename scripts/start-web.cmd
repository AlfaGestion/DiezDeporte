@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "APP_DIR=C:\inetpub\wwwroot\DiezDeporte"
set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
set "LOG_DIR=%APP_DIR%\scripts\logs"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "BUILD_LOG=%LOG_DIR%\build.log"
set "START_LOG=%LOG_DIR%\start.log"

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] No existe package.json en "%APP_DIR%"
  exit /b 1
)

if not exist "%NPM_CMD%" (
  echo [ERROR] No existe npm.cmd en "%NPM_CMD%"
  exit /b 1
)

cd /d "%APP_DIR%"
set "NEXT_TELEMETRY_DISABLED=1"

if not exist "%APP_DIR%\.next\BUILD_ID" (
  echo [INFO] No existe build. Ejecutando npm run build:webpack...
  "%NPM_CMD%" run build:webpack > "%BUILD_LOG%" 2>&1
  if errorlevel 1 (
    echo [ERROR] Fallo npm run build:webpack
    echo [INFO] Ver log: %BUILD_LOG%
    exit /b 1
  )
)

echo [INFO] Iniciando web...
"%NPM_CMD%" run start >> "%START_LOG%" 2>&1
if errorlevel 1 (
  echo [ERROR] Fallo npm run start
  echo [INFO] Ver log: %START_LOG%
  exit /b 1
)
exit /b 0

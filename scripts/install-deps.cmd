@echo off
setlocal

set "APP_DIR=C:\inetpub\wwwroot\DiezDeporte"

if not exist "%APP_DIR%\package.json" (
  echo [ERROR] No existe package.json en "%APP_DIR%".
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm no esta disponible en PATH. Instala Node.js.
  exit /b 1
)

cd /d "%APP_DIR%"
echo [INFO] Instalando dependencias con npm ci...
npm ci
if errorlevel 1 (
  echo [ERROR] Fallo npm ci.
  exit /b 1
)

echo [OK] Dependencias instaladas.
exit /b 0

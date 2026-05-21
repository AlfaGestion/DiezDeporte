@echo off
setlocal

set "SERVICE_NAME=DiezDeporteWeb"
set "DISPLAY_NAME=DiezDeporte Web"
set "APP_DIR=C:\inetpub\wwwroot\DiezDeporte"
set "START_CMD=%APP_DIR%\scripts\start-web.cmd"

if not exist "%START_CMD%" (
  echo [ERROR] No existe %START_CMD%
  pause
  exit /b 1
)

sc.exe query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel%==0 (
  echo [INFO] El servicio ya existe. Se elimina para recrear.
  sc.exe stop "%SERVICE_NAME%" >nul 2>&1
  timeout /t 2 /nobreak >nul
  sc.exe delete "%SERVICE_NAME%" >nul 2>&1
  timeout /t 2 /nobreak >nul
)

echo [INFO] Creando servicio %SERVICE_NAME%...
sc.exe create "%SERVICE_NAME%" binPath= "cmd.exe /c \"\"%START_CMD%\"\"" start= auto DisplayName= "%DISPLAY_NAME%"
if errorlevel 1 (
  echo [ERROR] No se pudo crear el servicio.
  pause
  exit /b 1
)

sc.exe description "%SERVICE_NAME%" "Servicio web DiezDeporte"
sc.exe failure "%SERVICE_NAME%" reset= 86400 actions= restart/5000/restart/5000/restart/5000

echo [INFO] Iniciando servicio...
sc.exe start "%SERVICE_NAME%"
if errorlevel 1 (
  echo [ERROR] No se pudo iniciar el servicio.
  pause
  exit /b 1
)

echo [OK] Servicio creado e iniciado.
echo [INFO] Estado: sc.exe query "%SERVICE_NAME%"
exit /b 0

$ErrorActionPreference = "Stop"

$serviceName = "DiezDeporteWebSvc"
$legacyServiceName = "DiezDeporteWeb"
$displayName = "DiezDeporte Web"
$description = "Servicio de Next.js para DiezDeporte (start-web.cmd)."
$appDir = "C:\inetpub\wwwroot\DiezDeporte"
$toolsDir = Join-Path $appDir "scripts\tools\nssm"
$nssmExe = Join-Path $toolsDir "nssm.exe"
$cmdExe = Join-Path $env:WINDIR "System32\cmd.exe"
$startCmd = Join-Path $appDir "scripts\start-web.cmd"
$nssmUrl = "https://github.com/ONLYOFFICE/nssm/releases/download/v2.24.1/nssm_x64.zip"

function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Fallo el comando: $FilePath $($Arguments -join ' ')"
  }
}

function Test-ServiceExists {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  & sc.exe query $Name | Out-Null
  return ($LASTEXITCODE -eq 0)
}

if (-not (Test-Path $appDir)) {
  throw "No existe la carpeta de la app: $appDir"
}

if (-not (Test-Path $startCmd)) {
  throw "No existe start-web.cmd en: $startCmd"
}

if (Test-ServiceExists -Name $legacyServiceName) {
  Write-Host "[INFO] Detectado servicio legado $legacyServiceName. Intentando limpiarlo en segundo plano..."
  & sc.exe stop $legacyServiceName | Out-Null
  & sc.exe delete $legacyServiceName | Out-Null
}

$null = New-Item -ItemType Directory -Force -Path $toolsDir

if (-not (Test-Path $nssmExe)) {
  $zipPath = Join-Path $env:TEMP "nssm-2.24.zip"
  $extractDir = Join-Path $env:TEMP "nssm-2.24"

  if (Test-Path $extractDir) {
    Remove-Item $extractDir -Recurse -Force
  }
  if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
  }

  Write-Host "[INFO] Descargando NSSM..."
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath
  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  $candidate = Get-ChildItem -Path $extractDir -Recurse -Filter nssm.exe | Select-Object -First 1

  if (-not $candidate) {
    throw "No se encontro nssm.exe dentro del paquete descargado."
  }

  Copy-Item $candidate.FullName $nssmExe -Force
}

if (Test-ServiceExists -Name $serviceName) {
  Write-Host "[INFO] El servicio ya existe. Se elimina para recrearlo..."
  & sc.exe stop $serviceName | Out-Null
  Start-Sleep -Seconds 2
  & sc.exe delete $serviceName | Out-Null

  $deadline = (Get-Date).AddSeconds(30)
  while ((Test-ServiceExists -Name $serviceName) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
  }

  if (Test-ServiceExists -Name $serviceName) {
    throw "Windows todavía está liberando el servicio $serviceName. Ejecutá el script otra vez en unos segundos."
  }
}

Write-Host "[INFO] Creando servicio $serviceName con NSSM..."
Invoke-NativeCommand -FilePath $nssmExe -Arguments @("install", $serviceName, $cmdExe, "/c", $startCmd)

Write-Host "[INFO] Iniciando servicio..."
Invoke-NativeCommand -FilePath $nssmExe -Arguments @("start", $serviceName)

Write-Host "[OK] Servicio instalado y levantado."
Write-Host "Nombre: $serviceName"
Write-Host "Comprobar estado: sc.exe query $serviceName"
Write-Host "Wrapper NSSM: $nssmExe"

$ErrorActionPreference = "Stop"

$serviceName = "DiezDeporteWeb"
$displayName = "DiezDeporte Web"
$description = "Servicio de Next.js para DiezDeporte (start-web.cmd)."
$appDir = "C:\inetpub\wwwroot\DiezDeporte"
$cmdExe = Join-Path $env:WINDIR "System32\cmd.exe"
$startCmd = Join-Path $appDir "scripts\start-web.cmd"

if (-not (Test-Path $appDir)) {
  throw "No existe la carpeta de la app: $appDir"
}

if (-not (Test-Path $startCmd)) {
  throw "No existe start-web.cmd en: $startCmd"
}

$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "[INFO] El servicio ya existe. Se elimina para recrearlo..."
  sc.exe stop $serviceName | Out-Null
  Start-Sleep -Seconds 2
  sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 2
}

$binPath = "`"$cmdExe`" /c `"`"$startCmd`"`""

Write-Host "[INFO] Creando servicio $serviceName..."
sc.exe create $serviceName binPath= $binPath start= auto DisplayName= "`"$displayName`"" | Out-Null
sc.exe description $serviceName "$description" | Out-Null
sc.exe config $serviceName start= delayed-auto | Out-Null
sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/5000/restart/5000 | Out-Null

Write-Host "[INFO] Iniciando servicio..."
sc.exe start $serviceName | Out-Null

Write-Host "[OK] Servicio instalado y levantado."
Write-Host "Nombre: $serviceName"
Write-Host "Comprobar estado: sc.exe query $serviceName"

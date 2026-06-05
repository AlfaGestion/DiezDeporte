$ErrorActionPreference = "Stop"

$serviceNames = @("DiezDeporteWebSvc", "DiezDeporteWeb")
$appDir = "C:\inetpub\wwwroot\DiezDeporte"
$nssmExe = Join-Path $appDir "scripts\tools\nssm\nssm.exe"
$removedAny = $false

foreach ($serviceName in $serviceNames) {
  $existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

  if (-not $existing) {
    continue
  }

  $removedAny = $true
  Write-Host "[INFO] Deteniendo servicio $serviceName..."
  if (Test-Path $nssmExe) {
    & $nssmExe stop $serviceName | Out-Null
  } else {
    sc.exe stop $serviceName | Out-Null
  }
  Start-Sleep -Seconds 2

  Write-Host "[INFO] Eliminando servicio $serviceName..."
  if (Test-Path $nssmExe) {
    & $nssmExe remove $serviceName confirm | Out-Null
  } else {
    sc.exe delete $serviceName | Out-Null
  }
}

if (-not $removedAny) {
  Write-Host "[INFO] No hay servicios de DiezDeporte para eliminar."
} else {
  Write-Host "[OK] Servicio(s) eliminado(s)."
}

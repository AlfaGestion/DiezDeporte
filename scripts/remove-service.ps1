$ErrorActionPreference = "Stop"

$serviceName = "DiezDeporteWeb"
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue

if (-not $existing) {
  Write-Host "[INFO] El servicio $serviceName no existe."
  exit 0
}

Write-Host "[INFO] Deteniendo servicio..."
sc.exe stop $serviceName | Out-Null
Start-Sleep -Seconds 2

Write-Host "[INFO] Eliminando servicio..."
sc.exe delete $serviceName | Out-Null

Write-Host "[OK] Servicio eliminado."

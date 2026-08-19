param(
    [ValidateSet("all", "missing")]
    [string]$Mode = "all"
)

$SourceFolder = $env:SOURCE_FOLDER
$FtpHostName = $env:FTP_HOST
$FtpPort = [int]$env:FTP_PORT
$FtpUser = $env:FTP_USER
$FtpPassword = $env:FTP_PASSWORD
$RemoteDir = if ($env:FTP_REMOTE_DIR) { $env:FTP_REMOTE_DIR.Trim('/').Replace('\', '/') } else { "" }

$AllowedExtensions = @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif")
$MaxFileSizeBytes = 8MB

function Get-LocalImageFiles {
    param(
        [string]$FolderPath,
        [string[]]$Extensions,
        [int]$MaxSizeBytes
    )

    if (-not (Test-Path $FolderPath)) {
        Write-Host "No existe la carpeta: $FolderPath"
        exit 1
    }

    $files = Get-ChildItem -Path $FolderPath -File | Where-Object {
        $Extensions -contains $_.Extension.ToLowerInvariant() -and
        -not $_.Name.ToLowerInvariant().StartsWith("tmp_")
    }

    if ($files.Count -eq 0) {
        Write-Host "No se encontraron imagenes (jpg/jpeg/png/webp/gif/avif) en $FolderPath (excluyendo tmp_*)."
        exit 0
    }

    $oversized = $files | Where-Object { $_.Length -gt $MaxSizeBytes }
    foreach ($f in $oversized) {
        Write-Warning "Se omite '$($f.Name)': pesa mas de 8 MB."
    }

    return $files | Where-Object { $_.Length -le $MaxSizeBytes }
}

function Get-RemoteFileNames {
    param(
        [string]$Dir
    )

    try {
        $uri = "ftp://$($FtpHostName):$($FtpPort)/$Dir"
        $req = [System.Net.FtpWebRequest]::Create($uri)
        $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPassword)
        $req.Method = [System.Net.WebRequestMethods+Ftp]::ListDirectory
        $req.UsePassive = $true
        $req.Timeout = 15000
        $resp = $req.GetResponse()
        $stream = $resp.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $listing = $reader.ReadToEnd()
        $reader.Close()
        $resp.Close()
        return $listing -split "`r?`n" | Where-Object { $_ -ne "" }
    } catch {
        Write-Host "No se pudo listar el FTP ($Dir): $($_.Exception.Message)"
        return @()
    }
}

function New-RemoteDir {
    param(
        [string]$Dir
    )

    $segments = $Dir.Split('/') | Where-Object { $_ -ne '' }
    $acc = ''
    foreach ($seg in $segments) {
        $acc = if ($acc) { "$acc/$seg" } else { $seg }
        try {
            $uri = "ftp://$($FtpHostName):$($FtpPort)/$acc"
            $req = [System.Net.FtpWebRequest]::Create($uri)
            $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPassword)
            $req.Method = [System.Net.WebRequestMethods+Ftp]::MakeDirectory
            $req.UsePassive = $true
            $req.Timeout = 15000
            $resp = $req.GetResponse()
            $resp.Close()
        } catch { }
    }
}

function Upload-ImageFiles {
    param(
        [System.IO.FileInfo[]]$Files,
        [string]$Dir
    )

    New-RemoteDir $Dir

    $ok = 0
    $fail = 0

    foreach ($f in $Files) {
        $remotePath = "$Dir/$($f.Name)"
        try {
            $uri = "ftp://$($FtpHostName):$($FtpPort)/$remotePath"
            $req = [System.Net.FtpWebRequest]::Create($uri)
            $req.Credentials = New-Object System.Net.NetworkCredential($FtpUser, $FtpPassword)
            $req.Method = [System.Net.WebRequestMethods+Ftp]::UploadFile
            $req.UsePassive = $true
            $req.UseBinary = $true
            $req.Timeout = 30000

            $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
            $req.ContentLength = $bytes.Length

            $stream = $req.GetRequestStream()
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Close()

            $resp = $req.GetResponse()
            $resp.Close()

            Write-Host "OK   $($f.Name)"
            $ok++
        } catch {
            Write-Warning "FALLO $($f.Name): $($_.Exception.Message)"
            $fail++
        }
    }

    return [pscustomobject]@{
        Ok = $ok
        Fail = $fail
    }
}

if (-not $FtpHostName) {
    Write-Host "No esta configurado FTP_HOST."
    exit 1
}

if (-not $FtpUser -or -not $FtpPassword) {
    Write-Host "No estan configurados FTP_USER y FTP_PASSWORD."
    exit 1
}

$localFiles = Get-LocalImageFiles -FolderPath $SourceFolder -Extensions $AllowedExtensions -MaxSizeBytes $MaxFileSizeBytes

Write-Host "Host: $($FtpHostName):$($FtpPort)"
Write-Host "Carpeta remota: /$RemoteDir"

if ($Mode -eq "all") {
    Write-Host "Archivos a subir: $($localFiles.Count)"
    Write-Host "---"

    $result = Upload-ImageFiles -Files $localFiles -Dir $RemoteDir
    Write-Host "---"
    Write-Host "Subidos: $($result.Ok) / $($localFiles.Count)  (fallidos: $($result.Fail))"
    exit 0
}

Write-Host "Consultando lo que ya existe en el FTP..."

$remoteEntries = Get-RemoteFileNames $RemoteDir
$remoteNames = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($entry in $remoteEntries) {
    $baseName = Split-Path -Leaf ($entry.Trim())
    if (-not $baseName) { continue }
    if ($baseName.ToLowerInvariant().StartsWith("tmp_")) { continue }
    [void]$remoteNames.Add($baseName.ToLowerInvariant())
}

Write-Host "Archivos validos ya en el FTP: $($remoteNames.Count)"
Write-Host "---"

$missingFiles = $localFiles | Where-Object { -not $remoteNames.Contains($_.Name.ToLowerInvariant()) }
$alreadyThereCount = $localFiles.Count - $missingFiles.Count

Write-Host "Imagenes locales: $($localFiles.Count)"
Write-Host "Ya estaban en el FTP (se saltean): $alreadyThereCount"
Write-Host "Nuevas para subir: $($missingFiles.Count)"
Write-Host "---"

if ($missingFiles.Count -eq 0) {
    Write-Host "No hay nada nuevo para subir."
    exit 0
}

$result = Upload-ImageFiles -Files $missingFiles -Dir $RemoteDir
Write-Host "---"
Write-Host "Subidos: $($result.Ok) / $($missingFiles.Count)  (fallidos: $($result.Fail), ya existian: $alreadyThereCount)"

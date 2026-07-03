# Installs Zig 0.16.0 stable to C:\zig for local agent development.
param(
    [string]$InstallDir = "C:\zig",
    [string]$Version = "0.16.0"
)

$ErrorActionPreference = "Stop"

$zipName = "zig-x86_64-windows-$Version.zip"
$downloadUrl = "https://ziglang.org/download/$Version/$zipName"
$tempZip = Join-Path $env:TEMP $zipName
$extractRoot = Join-Path $env:TEMP "zig-install-$Version"

Write-Host "[install-zig] downloading $downloadUrl"
Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -UseBasicParsing

if (Test-Path $extractRoot) {
    Remove-Item $extractRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
Expand-Archive -Path $tempZip -DestinationPath $extractRoot -Force

$sourceDir = Get-ChildItem -Path $extractRoot -Directory | Where-Object { $_.Name -like "zig-x86_64-windows-*" } | Select-Object -First 1
if (-not $sourceDir) {
    throw "Could not find extracted zig directory under $extractRoot"
}

if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path (Join-Path $sourceDir.FullName "*") -Destination $InstallDir -Recurse -Force

$zigExe = Join-Path $InstallDir "zig.exe"
if (-not (Test-Path $zigExe)) {
    throw "zig.exe not found at $zigExe"
}

$installedVersion = & $zigExe version
Write-Host "[install-zig] installed version=$installedVersion path=$InstallDir"
Write-Host "[install-zig] add to PATH: $InstallDir"

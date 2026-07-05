#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $true)]
    [string]$HostUrl,
    [Parameter(Mandatory = $true)]
    [string]$SetupKey,
    [string]$NetbirdManagementUrl = "",
    [string]$AgentVersion = "zig-0.1.0",
    [string]$InstallDir = "C:\Program Files\PlatformAgent",
    [string]$ServiceName = "naulite-agent",
    [int]$AgentPort = 9470,
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $programData = [Environment]::GetFolderPath("CommonApplicationData")
    $ConfigPath = Join-Path $programData "Platform\agent.json"
}

$PlatformRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Log {
    param([string]$Message)
    Write-Host "[naulite-agent] $Message"
}

function Get-BootstrapBundle {
  if (-not [string]::IsNullOrWhiteSpace($NetbirdManagementUrl)) {
    return
  }

  Write-Log "fetching bootstrap settings from $HostUrl/bootstrap/agent"
  $headers = @{ "X-Naulite-Setup-Key" = $SetupKey }
  $response = Invoke-RestMethod -Uri "$HostUrl/bootstrap/agent" -Headers $headers -Method Get
  $script:NetbirdManagementUrl = $response.netbirdManagementUrl

  if ([string]::IsNullOrWhiteSpace($NetbirdManagementUrl)) {
    throw "control plane did not return netbirdManagementUrl; pass -NetbirdManagementUrl"
  }
}

function Write-AgentConfig {
    $configDir = Split-Path -Parent $ConfigPath
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null

    $hostname = $env:COMPUTERNAME
    $agentUrl = "http://${hostname}:$AgentPort"
    $payload = @{
        cpUrl = $HostUrl.TrimEnd("/")
        hostname = $hostname
        agentUrl = $agentUrl
        agentVersion = $AgentVersion
        agentPort = $AgentPort
        dockerSocket = "//./pipe/docker_engine"
        netbirdManagementUrl = $NetbirdManagementUrl
        netbirdSetupKey = $SetupKey
    } | ConvertTo-Json -Depth 4

    Set-Content -Path $ConfigPath -Value $payload -Encoding UTF8
    Write-Log "wrote agent config path=$ConfigPath"
}

function Install-AgentBinary {
    $binPath = Join-Path $InstallDir "naulite-agent.exe"
    $agentRoot = Join-Path $PlatformRoot "packages\agent"

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    if (Get-Command zig -ErrorAction SilentlyContinue) {
        Write-Log "building agent from source with zig"
        Push-Location $agentRoot
        try {
            zig build -Doptimize=ReleaseSafe
            Copy-Item -Force (Join-Path $agentRoot "zig-out\bin\naulite-agent.exe") $binPath
        }
        finally {
            Pop-Location
        }
    }
    elseif (-not (Test-Path $binPath)) {
        throw "zig not found and no prebuilt binary at $binPath"
    }

    return $binPath
}

function Install-WindowsService {
    param(
        [string]$BinaryPath
    )

    $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        if ($existing.Status -eq "Running") {
            Stop-Service -Name $ServiceName -Force
        }
        sc.exe delete $ServiceName | Out-Null
        Start-Sleep -Seconds 2
    }

    $bin = "`"$BinaryPath`""
    sc.exe create $ServiceName binPath= $bin start= auto | Out-Null
    sc.exe description $ServiceName "Naulite node agent for control plane orchestration" | Out-Null

    [System.Environment]::SetEnvironmentVariable(
        "NAULITE_AGENT_CONFIG",
        $ConfigPath,
        [System.EnvironmentVariableTarget]::Machine
    )

    Start-Service -Name $ServiceName
}

$HostUrl = $HostUrl.TrimEnd("/")
Write-Log "installing naulite-agent $AgentVersion"
Get-BootstrapBundle
Write-AgentConfig
$binaryPath = Install-AgentBinary
Install-WindowsService -BinaryPath $binaryPath
Write-Log "service $ServiceName started; config=$ConfigPath"

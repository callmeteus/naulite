#Requires -RunAsAdministrator

param(
    [string]$AgentVersion = "0.1.0",
    [string]$InstallDir = "C:\Program Files\PlatformAgent",
    [string]$ServiceName = "platform-agent",
    [int]$ListenPort = 9470,
    [Parameter(Mandatory = $true)]
    [string]$NetbirdManagementUrl
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message)
    Write-Host "[platform-agent] $Message"
}

function Install-AgentBinary {
    $binPath = Join-Path $InstallDir "platform-agent.exe"
    $agentRoot = Join-Path $PSScriptRoot "..\packages\agent"

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    if (Get-Command zig -ErrorAction SilentlyContinue) {
        Write-Log "building agent from source with zig"
        Push-Location $agentRoot
        try {
            zig build -Doptimize=ReleaseSafe
            Copy-Item -Force (Join-Path $agentRoot "zig-out\bin\platform-agent.exe") $binPath
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
    sc.exe description $ServiceName "Platform node agent for control plane orchestration" | Out-Null

    [System.Environment]::SetEnvironmentVariable(
        "PLATFORM_AGENT_LISTEN_PORT",
        "$ListenPort",
        [System.EnvironmentVariableTarget]::Machine
    )

    [System.Environment]::SetEnvironmentVariable(
        "NETBIRD_MANAGEMENT_URL",
        "$NetbirdManagementUrl",
        [System.EnvironmentVariableTarget]::Machine
    )

    Start-Service -Name $ServiceName
}

Write-Log "installing platform-agent $AgentVersion"
$binaryPath = Install-AgentBinary
Install-WindowsService -BinaryPath $binaryPath
Write-Log "service $ServiceName started on port $ListenPort"

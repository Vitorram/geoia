[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,

    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$backendRoot = (Resolve-Path (Join-Path $repositoryRoot "backend")).Path
$envFile = Join-Path $repositoryRoot ".env"
$python = Join-Path $backendRoot ".venv\Scripts\python.exe"
$preflight = Join-Path $PSScriptRoot "preflight_backend.py"
$jwtSecretFile = Join-Path $env:LOCALAPPDATA "GeoIA\dev-jwt\jwt.dpapi"
$originalJwtEnvironment = [Environment]::GetEnvironmentVariable("JWT_SECRET_KEY", "Process")
$jwtLoadedFromStore = $false

if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
    throw "Arquivo .env da raiz não encontrado. Copie .env.example para .env e configure os valores localmente."
}

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Python do ambiente virtual não encontrado em backend\.venv. Crie o ambiente e instale backend\requirements.txt."
}

Push-Location $backendRoot
try {
    if (Test-Path -LiteralPath $jwtSecretFile -PathType Leaf) {
        $localAppData = [IO.Path]::GetFullPath($env:LOCALAPPDATA).TrimEnd('\') + '\'
        $resolvedSecretPath = [IO.Path]::GetFullPath($jwtSecretFile)
        if (-not $resolvedSecretPath.StartsWith($localAppData, [StringComparison]::OrdinalIgnoreCase)) {
            throw "JWT secret store must be inside LOCALAPPDATA."
        }
        if ($env:OneDrive -and $resolvedSecretPath.StartsWith([IO.Path]::GetFullPath($env:OneDrive), [StringComparison]::OrdinalIgnoreCase)) {
            throw "JWT secret store cannot be inside OneDrive."
        }

        $secretAcl = Get-Acl -LiteralPath $jwtSecretFile
        if (-not $secretAcl.AreAccessRulesProtected) {
            throw "JWT secret store ACL inherits permissions and cannot be trusted."
        }
        $allowedSids = @(
            [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
            "S-1-5-18",
            "S-1-5-32-544"
        )
        foreach ($rule in $secretAcl.Access) {
            try {
                $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
                if ($allowedSids -notcontains $ruleSid) {
                    throw "JWT secret store ACL grants access to an unapproved identity."
                }
            }
            catch [Security.Principal.IdentityNotMappedException] {
                throw "JWT secret store ACL could not be verified."
            }
        }

        $encryptedSecret = (Get-Content -LiteralPath $jwtSecretFile -Raw).Trim()
        if (-not $encryptedSecret) {
            throw "JWT secret store is empty."
        }
        $secureSecret = $null
        $secretPointer = [IntPtr]::Zero
        $secretValue = $null
        try {
            $secureSecret = ConvertTo-SecureString -String $encryptedSecret
            $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
            $secretValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
            if ($originalJwtEnvironment -and $originalJwtEnvironment -ne $secretValue) {
                throw "Process JWT_SECRET_KEY conflicts with the protected local secret store; no value was overwritten."
            }
            [Environment]::SetEnvironmentVariable("JWT_SECRET_KEY", $secretValue, "Process")
            $jwtLoadedFromStore = $true
        }
        catch {
            throw "Could not load the protected JWT secret store (" + $_.Exception.GetType().Name + ")."
        }
        finally {
            if ($secretPointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
            }
            if ($null -ne $secureSecret) {
                $secureSecret.Dispose()
            }
            $secretValue = $null
            $encryptedSecret = $null
        }
    }

    $preflightOutput = @(& $python $preflight 2>&1)
    $preflightExitCode = $LASTEXITCODE
    if ($preflightExitCode -ne 0) {
        $preflightOutput | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
        throw "Pré-checagem falhou (código $preflightExitCode). Uvicorn não foi iniciado."
    }
    $preflightOutput | ForEach-Object { Write-Host $_ }

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
    }
    catch {
        throw "A porta $Port já está ocupada ou não pode ser reservada. O processo existente não foi alterado."
    }
    finally {
        if ($null -ne $listener) {
            $listener.Stop()
        }
    }

    if ($CheckOnly) {
        Write-Host "Verificações concluídas; Uvicorn não foi iniciado."
        return
    }

    Write-Host "Iniciando FastAPI em http://127.0.0.1:$Port. Use Ctrl+C nesta janela para encerrar."
    & $python -m uvicorn --env-file $envFile app.main:app --reload --host 127.0.0.1 --port $Port --reload-dir $backendRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Uvicorn encerrou com código $LASTEXITCODE."
    }
}
finally {
    if ($jwtLoadedFromStore) {
        [Environment]::SetEnvironmentVariable("JWT_SECRET_KEY", $originalJwtEnvironment, "Process")
    }
    Pop-Location
}

[CmdletBinding()]
param(
    [switch]$CreateNewKey
)

$ErrorActionPreference = "Stop"

if (-not $CreateNewKey) {
    throw "Run with -CreateNewKey only during an explicitly authorized JWT rotation."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$python = Join-Path $repositoryRoot "backend\.venv\Scripts\python.exe"
$secretDirectory = Join-Path $env:LOCALAPPDATA "GeoIA\dev-jwt"
$secretFile = Join-Path $secretDirectory "jwt.dpapi"

if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "Python do ambiente virtual não encontrado em backend\.venv."
}
if (Test-Path -LiteralPath $secretFile) {
    throw "A protected JWT file already exists; refusing to replace it implicitly."
}
if ($env:OneDrive -and [IO.Path]::GetFullPath($secretDirectory).StartsWith([IO.Path]::GetFullPath($env:OneDrive), [StringComparison]::OrdinalIgnoreCase)) {
    throw "JWT secret storage must be outside OneDrive."
}

$createdDirectory = $false
$plainSecret = $null
$secureSecret = $null
try {
    if (-not (Test-Path -LiteralPath $secretDirectory -PathType Container)) {
        New-Item -ItemType Directory -Path $secretDirectory | Out-Null
        $createdDirectory = $true
    }

    $currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ($createdDirectory) {
        $directoryAcl = New-Object System.Security.AccessControl.DirectorySecurity
        $directoryAcl.SetAccessRuleProtection($true, $false)
        $directoryAcl.SetOwner($currentSid)
        $inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
        $identities = @($currentSid, [Security.Principal.SecurityIdentifier]::new("S-1-5-18"), [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544"))
        foreach ($identity in $identities) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                $identity,
                [Security.AccessControl.FileSystemRights]::FullControl,
                $inheritance,
                [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow
            )
            $directoryAcl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $secretDirectory -AclObject $directoryAcl
    }
    else {
        $existingDirectoryAcl = Get-Acl -LiteralPath $secretDirectory
        if (-not $existingDirectoryAcl.AreAccessRulesProtected) {
            throw "Existing JWT directory inherits permissions; refusing to store a key there."
        }
        $allowedSids = @(
            [Security.Principal.WindowsIdentity]::GetCurrent().User.Value,
            "S-1-5-18",
            "S-1-5-32-544"
        )
        foreach ($rule in $existingDirectoryAcl.Access) {
            $ruleSid = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
            if ($allowedSids -notcontains $ruleSid) {
                throw "Existing JWT directory grants access to an unapproved identity."
            }
        }
    }

    $pythonOutput = @(& $python -c "import secrets; print(secrets.token_urlsafe(48))" 2>$null)
    if ($LASTEXITCODE -ne 0 -or $pythonOutput.Count -ne 1) {
        throw "Cryptographic key generation failed. No key was stored."
    }
    $plainSecret = ([string]$pythonOutput[0]).Trim()
    if ($plainSecret.Length -lt 32) {
        throw "Generated key did not meet the minimum length. No key was stored."
    }

    $secureSecret = ConvertTo-SecureString -String $plainSecret -AsPlainText -Force
    $protectedValue = ConvertFrom-SecureString -SecureString $secureSecret
    [IO.File]::WriteAllText($secretFile, $protectedValue, [Text.UTF8Encoding]::new($false))

    $fileAcl = New-Object System.Security.AccessControl.FileSecurity
    $fileAcl.SetAccessRuleProtection($true, $false)
    $fileAcl.SetOwner($currentSid)
    $fileIdentities = @($currentSid, [Security.Principal.SecurityIdentifier]::new("S-1-5-18"), [Security.Principal.SecurityIdentifier]::new("S-1-5-32-544"))
    foreach ($identity in $fileIdentities) {
        $fileRule = [Security.AccessControl.FileSystemAccessRule]::new(
            $identity,
            [Security.AccessControl.FileSystemRights]::FullControl,
            [Security.AccessControl.AccessControlType]::Allow
        )
        $fileAcl.AddAccessRule($fileRule)
    }
    Set-Acl -LiteralPath $secretFile -AclObject $fileAcl
    $fileAcl = Get-Acl -LiteralPath $secretFile
    if (-not $fileAcl.AreAccessRulesProtected) {
        Remove-Item -LiteralPath $secretFile -Force
        throw "JWT file ACL is not protected. The generated file was removed."
    }
    Write-Host "New JWT secret generated and stored encrypted with Windows DPAPI under LOCALAPPDATA. Secret value was not displayed."
}
finally {
    if ($null -ne $secureSecret) {
        $secureSecret.Dispose()
    }
    $plainSecret = $null
    $pythonOutput = $null
    $protectedValue = $null
}

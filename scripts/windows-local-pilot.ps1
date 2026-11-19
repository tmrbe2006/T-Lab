# T-Lab — safeguarded, local-only pilot on a brand-new MySQL test schema.
# Run from the repository root in Windows 11 PowerShell.
param(
  [switch]$InitializeEmptySandbox,
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host 'T-Lab Local Sandbox Pilot — NO patient records or official invoices' -ForegroundColor Yellow

if (-not (Test-Path '.env')) {
  throw 'Create a LOCAL .env containing MYSQL_HOST=127.0.0.1 and a NEW empty MYSQL_DATABASE=tlab_local_test. Do not point to the existing lab database.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Install Node.js 22 LTS (or the verified compatible version) first.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is required for test build. Installation was not changed.'
}

$env:NODE_ENV = 'production'
$env:TLAB_ENABLE_LEGACY_API = 'false'
$env:TLAB_ENABLE_UNSAFE_BULK_IMPORT = 'false'
$env:TLAB_ENABLE_SNAPSHOT_PULL = 'false'
$env:TLAB_ALLOW_SCHEMA_BOOTSTRAP = 'false'
$env:MYSQL_AUTO_SYNC = 'false'

if (-not (Test-Path 'node_modules\tsx\dist\cli.mjs')) {
  Write-Host 'Installing the pinned application dependencies...'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}
if ($InitializeEmptySandbox) {
  $env:TLAB_SANDBOX_INIT = 'CONFIRM_EMPTY_TEST_DATABASE'
  try {
    & node --import tsx scripts/init-sandbox.ts
    if ($LASTEXITCODE -ne 0) { throw 'Sandbox initialization refused or failed. No existing data was deleted.' }
  } finally {
    Remove-Item Env:\TLAB_SANDBOX_INIT -ErrorAction SilentlyContinue
  }
}
& node --import tsx scripts/check-local-sandbox.ts
if ($LASTEXITCODE -ne 0) { throw 'Sandbox check failed. Refusing to launch the server.' }
if ($CheckOnly) {
  Write-Host 'Sandbox configuration check passed. The server has not been started.' -ForegroundColor Green
  exit 0
}
Write-Host 'Validating TypeScript and building static front-end...'
& npm run lint
if ($LASTEXITCODE -ne 0) { throw 'TypeScript errors; server not started' }
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; server not started' }
Write-Host 'Launching local sandbox UI: http://localhost:3007 (port follows .env)' -ForegroundColor Green
Write-Host 'Use synthetic data only. Close this PowerShell window to stop the test server.'
& node --import tsx server.ts --static-dist
if ($LASTEXITCODE -ne 0) { throw 'Local server exited with an error' }

# Vercel ortam degiskenlerini .env.vercel dosyasindan yukler
# Kullanim: .\scripts\push-vercel-env.ps1
# Gereksinim: npm i -g vercel && vercel login

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.vercel"

if (-not (Test-Path $envFile)) {
    Write-Error ".env.vercel bulunamadi: $envFile"
}

Write-Host "Vercel projesine env yukleniyor..." -ForegroundColor Cyan

Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }

    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }

    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()

    Write-Host "  + $key" -ForegroundColor Gray
    $value | vercel env add $key production preview development --force 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    (manuel ekleyin veya vercel login yapin)" -ForegroundColor Yellow
    }
}

Write-Host "`nTamamlandi. Vercel Dashboard'dan kontrol edin." -ForegroundColor Green
Write-Host "Deploy: vercel --prod" -ForegroundColor Green

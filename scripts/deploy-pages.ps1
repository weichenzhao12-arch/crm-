$ErrorActionPreference = 'Stop'

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host 'Set CLOUDFLARE_API_TOKEN before deploy.' -ForegroundColor Yellow
  Write-Host 'Example: $env:CLOUDFLARE_API_TOKEN="your Cloudflare API Token"'
  exit 1
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$node = 'C:\Users\Administrator\AppData\Local\OpenAI\Codex\bin\5b9024f90663758b\node.exe'
$wrangler = 'C:\Users\Administrator\.codex\tmp\wrangler-run\node_modules\wrangler\bin\wrangler.js'
$vite = (Resolve-Path (Join-Path $root 'node_modules\.pnpm\vite@8.0.10_@types+node@25._a504be9ec6a953b589d03d9e81a447b1\node_modules\vite\bin\vite.js')).Path

Push-Location $root
try {
  & $node $vite build
  & $node $wrangler pages deploy dist --project-name quote-crm-system --branch main --commit-dirty=true
}
finally {
  Pop-Location
}

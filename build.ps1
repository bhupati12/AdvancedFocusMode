$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
$zip = Join-Path $dist 'advanced-focus-mode.zip'

if (Test-Path $dist) {
  Remove-Item $dist -Recurse -Force
}

New-Item -ItemType Directory -Path $dist | Out-Null

$files = @(
  'manifest.json',
  'background.js',
  'shared.js',
  'newtab.html',
  'newtab.css',
  'newtab.js',
  'blocked.html',
  'blocked.css',
  'blocked.js',
  'options.html',
  'options.css',
  'options.js',
  'icon.svg'
)

Compress-Archive -Path ($files | ForEach-Object { Join-Path $root $_ }) -DestinationPath $zip -Force

Write-Host "Created $zip"

param(
  [string]$Root = "motuwe-extension"
)

Write-Host "== Motuwe extension fixer =="

# Find root directory (handle misspelling)
$altRoot = "motuwe-extenson"
if (-not (Test-Path $Root) -and (Test-Path $altRoot)) {
  Write-Host "Renaming $altRoot -> $Root"
  Rename-Item -Path $altRoot -NewName $Root -ErrorAction SilentlyContinue
}

if (-not (Test-Path $Root)) {
  Write-Error "Extension root '$Root' not found. Run from repo root or pass -Root."; exit 1
}

function Rename-IfExists {
  param([string]$Path, [string]$NewName)
  if (Test-Path $Path) {
    Write-Host "Rename: $Path -> $NewName"
    Rename-Item -Path $Path -NewName $NewName -ErrorAction SilentlyContinue
  }
}

function Ensure-FolderName {
  param([string]$Parent, [string]$Current, [string]$Expected)
  $curPath = Join-Path $Parent $Current
  $expPath = Join-Path $Parent $Expected
  if ((Test-Path $curPath) -and (-not (Test-Path $expPath))) {
    Write-Host "Rename folder: $curPath -> $expPath"
    Rename-Item -Path $curPath -NewName $Expected -ErrorAction SilentlyContinue
  }
}

# Fix common misspellings inside root
Ensure-FolderName -Parent $Root -Current "mages" -Expected "images"
Ensure-FolderName -Parent $Root -Current "mage" -Expected "images"
Ensure-FolderName -Parent $Root -Current "image" -Expected "images"
Ensure-FolderName -Parent $Root -Current "css" -Expected "css"
Ensure-FolderName -Parent $Root -Current "js" -Expected "js"

# Image filename fixes
$imgDir = Join-Path $Root "images"
if (Test-Path $imgDir) {
  Rename-IfExists -Path (Join-Path $imgDir "con.svg") -NewName "icon.svg"
  Rename-IfExists -Path (Join-Path $imgDir "con16.png") -NewName "icon16.png"
  Rename-IfExists -Path (Join-Path $imgDir "con32.png") -NewName "icon32.png"
  Rename-IfExists -Path (Join-Path $imgDir "con48.png") -NewName "icon48.png"
  Rename-IfExists -Path (Join-Path $imgDir "con128.png") -NewName "icon128.png"
}

# CSS filename fixes
$cssDir = Join-Path $Root "css"
if (Test-Path $cssDir) {
  Rename-IfExists -Path (Join-Path $cssDir "nject.css") -NewName "inject.css"
}

# JS filename fixes (root and js/ subfolder)
Rename-IfExists -Path (Join-Path $Root "optons.html") -NewName "options.html"
Rename-IfExists -Path (Join-Path $Root "optons.js") -NewName "options.js"
Rename-IfExists -Path (Join-Path $Root "manfest.json") -NewName "manifest.json"
Rename-IfExists -Path (Join-Path $Root "selector-engne.js") -NewName "selector-engine.js"

$jsDir = Join-Path $Root "js"
if (Test-Path $jsDir) {
  Rename-IfExists -Path (Join-Path $jsDir "optons.js") -NewName "options.js"
  Rename-IfExists -Path (Join-Path $jsDir "selector-engne.js") -NewName "selector-engine.js"
}

# Helper to choose first existing path from candidates
function First-Existing {
  param([string[]]$Candidates)
  foreach ($c in $Candidates) { if (Test-Path $c) { return $c } }
  return $null
}

$bg = First-Existing @(
  (Join-Path $Root "background.js"),
  (Join-Path $jsDir "background.js")
)
$content = First-Existing @(
  (Join-Path $Root "content.js"),
  (Join-Path $jsDir "content.js")
)
$popup = First-Existing @(
  (Join-Path $Root "popup.html")
)
$options = First-Existing @(
  (Join-Path $Root "options.html")
)
$cssContent = First-Existing @(
  (Join-Path $cssDir "content.css")
)
$cssInject = First-Existing @(
  (Join-Path $cssDir "inject.css")
)

# Build a clean MV3 manifest
$icons = @{}
foreach ($size in 16,32,48,128) {
  $iconPath = Join-Path $imgDir ("icon{0}.png" -f $size)
  if (Test-Path $iconPath) { $icons[[string]$size] = ("images/icon{0}.png" -f $size) }
}
if ($icons.Count -eq 0 -and (Test-Path (Join-Path $imgDir "icon.svg"))) {
  $icons["128"] = "images/icon.svg"  # fallback
}

$manifest = [ordered]@{
  manifest_version = 3
  name = "Motuwe Scraper"
  version = "1.0.0"
  description = "Configurable, reliable web scraper with preview and backend upload."
}
if ($icons.Count -gt 0) { $manifest.icons = $icons }

$action = [ordered]@{}
if ($popup) { $action.default_popup = (Split-Path -Leaf $popup) }
if ($action.Keys.Count -gt 0) { $action.default_title = "Motuwe Scraper"; $manifest.action = $action }

if ($options) { $manifest.options_page = (Split-Path -Leaf $options) }

if ($bg) {
  $manifest.background = @{ service_worker = (Split-Path -Leaf $bg); type = "module" }
}

$manifest.permissions = @("activeTab","scripting","storage","webNavigation","alarms")
$manifest.host_permissions = @("<all_urls>")

$cs = @()
if ($content) {
  $entry = @{ matches = @("<all_urls>"); js = @((Split-Path -Leaf $content)); run_at = "document_idle" }
  $cssList = @()
  if ($cssContent) { $cssList += "css/" + (Split-Path -Leaf $cssContent) }
  if ($cssInject) { $cssList += "css/" + (Split-Path -Leaf $cssInject) }
  if ($cssList.Count -gt 0) { $entry.css = $cssList }
  $cs += $entry
}
if ($cs.Count -gt 0) { $manifest.content_scripts = $cs }

$manifest.web_accessible_resources = @(@{ resources = @("css/*","images/*","js/*"); matches = @("<all_urls>") })

$json = ($manifest | ConvertTo-Json -Depth 6)
$manifestPath = Join-Path $Root "manifest.json"
Write-Host "Writing manifest to $manifestPath"
$json | Set-Content -Encoding UTF8 -Path $manifestPath

Write-Host "Done. Review $manifestPath and load as unpacked extension."


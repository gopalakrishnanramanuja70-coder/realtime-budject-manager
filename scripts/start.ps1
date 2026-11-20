# Run by the VS Code task "Start Expensify" on Windows. Installs what is missing, then starts the server.
param([int]$Port = 8080)

Set-Location (Split-Path -Parent $PSScriptRoot)

function Find-Javac {
  $c = Get-Command javac -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($root in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft")) {
    if (Test-Path $root) {
      $f = Get-ChildItem -Path $root -Filter javac.exe -Recurse -Depth 3 -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending | Select-Object -First 1
      if ($f) { return $f.FullName }
    }
  }
  return $null
}

function Get-Major($javac) {
  $text = (& $javac -version 2>&1 | Out-String)
  if ($text -match 'javac (\d+)') { return [int]$Matches[1] }
  return 0
}

$javac = Find-Javac
if (-not $javac -or (Get-Major $javac) -lt 17) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host 'A Java JDK 17 or newer is required and winget is not available to install it.'
    Write-Host 'Install a JDK from https://adoptium.net, close and reopen VS Code, then run this task again.'
    exit 1
  }
  Write-Host 'Installing Java JDK 21 (one time). Click Yes if Windows asks for permission...'
  winget install -e --id EclipseAdoptium.Temurin.21.JDK --accept-package-agreements --accept-source-agreements
  $javac = Find-Javac
  if (-not $javac -or (Get-Major $javac) -lt 17) {
    Write-Host 'The JDK was installed but could not be found yet. Close and reopen VS Code, then run this task again.'
    exit 1
  }
}
$java = Join-Path (Split-Path $javac) 'java.exe'
Write-Host "Using $javac"

$jar = 'lib\sqlite-jdbc.jar'
$sha1 = 'f97e937f877cf3f2a2d84ce866d399a7da6ef08b'
if (-not (Test-Path $jar)) {
  New-Item -ItemType Directory -Force lib | Out-Null
  Write-Host 'Downloading the SQLite driver (one time, about 13 MB)...'
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.42.0.1/sqlite-jdbc-3.42.0.1.jar' -OutFile $jar
  } catch {
    Write-Host 'Download failed. Check your internet connection and run this task again.'
    exit 1
  }
  if ((Get-FileHash -Algorithm SHA1 $jar).Hash.ToLower() -ne $sha1) {
    Rename-Item $jar 'sqlite-jdbc.jar.bad'
    Write-Host 'The downloaded driver failed its checksum and was renamed to sqlite-jdbc.jar.bad. Run this task again.'
    exit 1
  }
}

New-Item -ItemType Directory -Force build | Out-Null
$sources = Get-ChildItem src -Filter *.java | ForEach-Object { $_.FullName }
& $javac -cp $jar -d build $sources
if ($LASTEXITCODE -ne 0) { exit 1 }

& $java --enable-native-access=ALL-UNNAMED -cp "build;$jar" Main $Port

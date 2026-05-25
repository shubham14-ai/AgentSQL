param(
    [string]$SqlFile = "data.sql"
)

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

$EnvPath = Join-Path $ProjectRoot '.env'
if (-not (Test-Path $EnvPath)) {
    Write-Error '.env file not found in project root.'
    exit 1
}

$envLines = Get-Content $EnvPath
$databaseUrl = ($envLines | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=', ''
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    Write-Error 'DATABASE_URL is missing or empty in .env.'
    exit 1
}

if (-not (Test-Path $SqlFile)) {
    Write-Error "SQL file not found: $SqlFile"
    exit 1
}

Write-Host "Using DATABASE_URL=$databaseUrl"
Write-Host "Importing SQL file: $SqlFile"

function CommandExists {
    param([string]$name)
    return (Get-Command $name -ErrorAction SilentlyContinue) -ne $null
}

function RunDockerImport {
    param([string]$url, [string]$sqlFile)

    if (-not (CommandExists 'docker')) {
        Write-Error 'docker is not installed or not in PATH; cannot perform fallback import.'
        exit 1
    }

    Write-Warning 'psql/mysql client not found. Falling back to Docker backend container import.'

    $pythonScript = @'
import sys
from pathlib import Path
from sqlalchemy import create_engine

url = sys.argv[1]
sql_file = sys.argv[2]
script = Path(sql_file).read_text()
engine = create_engine(url)
with engine.begin() as conn:
    conn.exec_driver_sql(script)
print('Imported SQL file via Docker backend container.')
'@

    $tempPath = Join-Path $ProjectRoot 'upload_data_tmp.py'
    Set-Content -Path $tempPath -Value $pythonScript -NoNewline
    try {
        docker compose run --rm -v "$ProjectRoot:/workspace" backend python "/workspace/$(Split-Path -Leaf $tempPath)" "$url" "/workspace/$sqlFile"
    } finally {
        Remove-Item -Path $tempPath -ErrorAction SilentlyContinue
    }
}

function RunPostgresImport {
    param([string]$url, [string]$sqlFile)

    if (CommandExists 'psql') {
        python - "$url" "$sqlFile" <<'PY'
import os
import sys
import urllib.parse
import subprocess

url = sys.argv[1]
sql_file = sys.argv[2]
parsed = urllib.parse.urlparse(url)

user = urllib.parse.unquote(parsed.username or "")
password = urllib.parse.unquote(parsed.password or "")
host = parsed.hostname or "localhost"
port = parsed.port or 5432
db = parsed.path.lstrip('/')
if not db:
    raise SystemExit('DATABASE_URL must include a database name.')

cmd = ['psql']
if user:
    cmd += ['-U', user]
if host:
    cmd += ['-h', host]
if port:
    cmd += ['-p', str(port)]
cmd += [db, '-f', sql_file]

env = os.environ.copy()
if password:
    env['PGPASSWORD'] = password

print('Running:', ' '.join(cmd))
subprocess.run(cmd, check=True, env=env)
PY
    } else {
        RunDockerImport $url $sqlFile
    }
}

function RunMySqlImport {
    param([string]$url, [string]$sqlFile)

    if (CommandExists 'mysql') {
        python - "$url" "$sqlFile" <<'PY'
import sys
import urllib.parse
import subprocess

url = sys.argv[1]
sql_file = sys.argv[2]
parsed = urllib.parse.urlparse(url)

user = urllib.parse.unquote(parsed.username or "")
password = urllib.parse.unquote(parsed.password or "")
host = parsed.hostname or "localhost"
port = parsed.port or 3306
db = parsed.path.lstrip('/')
if not db:
    raise SystemExit('DATABASE_URL must include a database name.')

cmd = ['mysql']
if user:
    cmd += ['-u', user]
if password:
    cmd += ['-p' + password]
if host:
    cmd += ['-h', host]
if port:
    cmd += ['-P', str(port)]
cmd += [db]

print('Running:', ' '.join(cmd))
with open(sql_file, 'rb') as f:
    subprocess.run(cmd, stdin=f, check=True)
PY
    } else {
        RunDockerImport $url $sqlFile
    }
}

if ($databaseUrl -match '^(postgresql\+psycopg2|postgresql)://') {
    RunPostgresImport $databaseUrl $SqlFile
} elseif ($databaseUrl -match '^(mysql\+pymysql|mysql)://') {
    RunMySqlImport $databaseUrl $SqlFile
} else {
    Write-Error "Unsupported DATABASE_URL scheme: $databaseUrl"
    exit 1
}

Write-Host '[OK] SQL import complete.'

#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

ENV_FILE="$PROJECT_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "[ERROR] .env file not found in project root."
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n 1 | cut -d '=' -f 2-)
if [[ -z "$DATABASE_URL" ]]; then
  echo "[ERROR] DATABASE_URL is missing or empty in .env."
  exit 1
fi

INPUT_SQL_FILE="${1:-data.sql}"
if [[ -f "$INPUT_SQL_FILE" ]]; then
  SQL_FILE="$INPUT_SQL_FILE"
elif [[ -f "$PROJECT_ROOT/$INPUT_SQL_FILE" ]]; then
  SQL_FILE="$PROJECT_ROOT/$INPUT_SQL_FILE"
elif [[ -f "$SCRIPT_DIR/$INPUT_SQL_FILE" ]]; then
  SQL_FILE="$SCRIPT_DIR/$INPUT_SQL_FILE"
else
  echo "[ERROR] SQL file not found: $INPUT_SQL_FILE"
  exit 1
fi

SQL_FILE_ABS="$(cd "$(dirname "$SQL_FILE")" && pwd)/$(basename "$SQL_FILE")"
SQL_FILE_REL="${SQL_FILE_ABS#$PROJECT_ROOT/}"

if [[ "$SQL_FILE_REL" == "$SQL_FILE_ABS" ]]; then
  echo "[ERROR] SQL file must be inside project root: $PROJECT_ROOT"
  echo "[ERROR] Received: $SQL_FILE_ABS"
  exit 1
fi

echo "Using DATABASE_URL=$DATABASE_URL"
echo "Importing SQL file: $SQL_FILE_REL"

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_docker_import() {
  local url="$1"
  local sql_file="$2"

  if ! command_exists docker; then
    echo "[ERROR] docker is not installed or not in PATH; cannot perform fallback import."
    exit 1
  fi

  echo "[WARN] psql/mysql client not found. Falling back to Docker backend container import."
  cat "$SQL_FILE_ABS" | docker compose run --rm backend python - "$url" - <<'PY'
import sys
from sqlalchemy import create_engine

url = sys.argv[1]
script = sys.stdin.read()
engine = create_engine(url)
with engine.begin() as conn:
    conn.exec_driver_sql(script)
print('Imported SQL file via Docker backend container.')
PY
}

run_postgres_import() {
  local url="$1"
  local sql_file="$2"

  if command_exists psql; then
    python - "$url" "$sql_file" <<'PY'
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
  else
    run_docker_import "$url" "$SQL_FILE_REL"
  fi
}

run_mysql_import() {
  local url="$1"
  local sql_file="$2"

  if command_exists mysql; then
    python - "$url" "$sql_file" <<'PY'
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
  else
    run_docker_import "$url" "$SQL_FILE_REL"
  fi
}

case "$DATABASE_URL" in
  postgresql+psycopg2://*|postgresql://*)
    run_postgres_import "$DATABASE_URL" "$SQL_FILE_ABS"
    ;;

  mysql+pymysql://*|mysql://*)
    run_mysql_import "$DATABASE_URL" "$SQL_FILE_ABS"
    ;;

  *)
    echo "[ERROR] Unsupported DATABASE_URL scheme: $DATABASE_URL"
    exit 1
    ;;
esac

echo "[OK] SQL import complete."

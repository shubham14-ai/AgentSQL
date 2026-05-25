#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok() { echo -e "${GREEN}[OK]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
BACKEND_URL="${BACKEND_URL:-http://localhost:8000}"

echo ""
echo "=================================================================================================================="
echo "                                      SQL AGENT - CONNECTION TEST"
echo "=================================================================================================================="
echo ""

test_get() {
    local label="$1"
    local url="$2"

    if curl -fsS "$url" > /tmp/sql-agent-test-response.txt 2>/tmp/sql-agent-test-error.txt; then
        ok "$label reachable: $url"
        return 0
    fi

    fail "$label failed: $url"
    cat /tmp/sql-agent-test-error.txt
    return 1
}

test_chat() {
    local payload='{"message":"Say hello from AgentSQL in one short sentence."}'

    if curl -fsS \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "$BACKEND_URL/api/chat" > /tmp/sql-agent-chat-response.json 2>/tmp/sql-agent-chat-error.txt; then
        ok "Chat API reachable: $BACKEND_URL/api/chat"
        info "Chat response:"
        cat /tmp/sql-agent-chat-response.json
        echo ""
        return 0
    fi

    fail "Chat API failed"
    cat /tmp/sql-agent-chat-error.txt
    return 1
}

test_env_file() {
    if [ ! -f ".env" ]; then
        fail ".env file not found"
        return 1
    fi

    info "Using env file: $PROJECT_ROOT/.env"

    local nvidia_key
    nvidia_key=$(grep -E '^NVIDIA_API_KEY=' .env | head -n 1 | cut -d '=' -f 2-)

    if [ -n "$nvidia_key" ]; then
        ok "NVIDIA_API_KEY is present in .env"
    else
        warn "NVIDIA_API_KEY is empty in .env"
        warn "Add the key, then recreate the backend container: docker compose up -d --force-recreate backend"
    fi
}

test_backend_runtime_env() {
    if ! command -v docker >/dev/null 2>&1; then
        return 0
    fi

    if ! docker compose ps backend >/dev/null 2>&1; then
        warn "Could not inspect backend container env"
        return 0
    fi

    info "Backend container env snapshot:"
    docker compose exec -T backend sh -lc '
        nvidia_len=${#NVIDIA_API_KEY}
        echo "  NVIDIA_API_KEY=<redacted length=${nvidia_len}>"
        echo "  NVIDIA_BASE_URL=${NVIDIA_BASE_URL}"
        echo "  NVIDIA_MODEL=${NVIDIA_MODEL}"
        echo "  DATABASE_URL=$(echo "$DATABASE_URL" | sed -E "s#//([^:]+):([^@]+)@#//\\1:<redacted>@#")"
    ' || warn "Could not inspect backend container env"
}

test_database() {
    local status
    status=$(curl -sS -o /tmp/sql-agent-db-response.json -w "%{http_code}" "$BACKEND_URL/api/database/health" 2>/tmp/sql-agent-db-error.txt || true)

    if [ "$status" = "200" ]; then
        ok "Database health check passed"
        cat /tmp/sql-agent-db-response.json
        echo ""
        return 0
    fi

    fail "Database health check failed with HTTP $status"
    if [ -s /tmp/sql-agent-db-response.json ]; then
        cat /tmp/sql-agent-db-response.json
        echo ""
    fi

    warn "If backend runs in Docker, MySQL host must be host.docker.internal, not localhost."
    warn "Confirm MySQL is running on Windows port 3306 and database sqlagent exists."
    warn "Confirm username/password match docker-compose.yml DATABASE_URL."
    return 1
}

test_docker_services() {
    if ! command -v docker >/dev/null 2>&1; then
        warn "Docker CLI not found; skipping Docker service checks"
        return 0
    fi

    info "Docker Compose services:"
    docker compose ps || warn "Could not read Docker Compose status"
}

failures=0

test_env_file
test_backend_runtime_env
test_get "Frontend" "$FRONTEND_URL" || failures=$((failures + 1))
test_get "Backend health" "$BACKEND_URL/health" || failures=$((failures + 1))
test_chat || failures=$((failures + 1))
test_database || failures=$((failures + 1))
test_docker_services

echo ""
if [ "$failures" -eq 0 ]; then
    ok "All connection checks passed"
else
    fail "$failures connection check(s) failed"
    exit 1
fi

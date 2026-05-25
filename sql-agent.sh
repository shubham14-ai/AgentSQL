#!/bin/bash

# ====================================================================
# Docker Management Script - SQL Agent
# ====================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_NAME="sql-agent"
SERVICES="frontend backend redis qdrant"

print_status() { echo -e "${GREEN}[✓]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
print_error() { echo -e "${RED}[✗]${NC} $1"; }
print_header() { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }
print_info() { echo -e "${CYAN}[i]${NC} $1"; }

export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

require_env() {
    if [ ! -f ".env" ]; then
        print_error ".env file not found"
        print_info "Create .env before starting the stack"
        exit 1
    fi
}

show_urls() {
    echo ""
    print_header "SERVICE URLS"
    echo "  Frontend:    http://localhost:3000"
    echo "  Backend API: http://localhost:8000"
    echo "  Health:      http://localhost:8000/health"
    echo "  Redis:       localhost:6379"
    echo "  Qdrant:      http://localhost:6333"
    echo ""
}

normalize_service() {
    case "$1" in
        app|backend)
            echo "backend"
            ;;
        frontend|redis|qdrant)
            echo "$1"
            ;;
        "")
            echo ""
            ;;
        *)
            print_error "Unknown service: $1"
            print_info "Valid services: frontend, backend, app, redis, qdrant"
            exit 1
            ;;
    esac
}

init() {
    print_header "BUILD + START"
    require_env

    start_time=$(date +%s)

    print_status "Building images..."
    docker compose build --parallel

    print_status "Starting all services..."
    docker compose up -d

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    print_header "INIT COMPLETED"
    print_status "Time: ${duration}s"
    show_urls
}

build() {
    print_header "BUILD IMAGES"

    start_time=$(date +%s)

    print_status "Building images..."
    docker compose build --parallel

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    print_header "BUILD COMPLETED"
    print_status "Time: ${duration}s"
    print_info "Next: ./sql-agent.sh start"
}

rebuild() {
    print_header "INCREMENTAL REBUILD"

    start_time=$(date +%s)

    print_status "Stopping containers..."
    docker compose down --remove-orphans

    print_status "Building updated images (no cache)..."
    docker compose build --no-cache --parallel

    print_status "Starting services..."
    docker compose up -d

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    print_header "REBUILD COMPLETED"
    print_status "Time: ${duration}s"
    show_urls
}

reload() {
    print_header "RELOAD SERVICES"

    start_time=$(date +%s)

    docker compose up -d

    end_time=$(date +%s)
    duration=$((end_time - start_time))

    print_status "Reloaded in ${duration}s"
    show_urls
}

start() {
    require_env
    print_status "Starting all services..."
    docker compose up -d
    print_status "Services started"
    show_urls
}

stop() {
    print_status "Stopping all services..."
    docker compose down
    print_status "Services stopped"
}

restart() {
    print_header "RESTARTING SERVICES"
    stop
    start
}

logs() {
    local service
    service=$(normalize_service "$2")

    if [ -z "$service" ]; then
        print_info "Showing logs for all services (Ctrl+C to exit)"
        docker compose logs -f
    else
        print_info "Showing logs for ${service} (Ctrl+C to exit)"
        docker compose logs -f "$service"
    fi
}

status() {
    print_header "SERVICE STATUS"
    docker compose ps
    echo ""
    print_header "RESOURCE USAGE"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
}

health() {
    print_header "HEALTH CHECKS"

    echo -n "Backend: "
    if curl -sf http://localhost:8000/health > /dev/null; then
        print_status "Healthy"
    else
        print_error "Unhealthy"
    fi

    echo -n "Frontend: "
    if curl -sf http://localhost:3000 > /dev/null; then
        print_status "Healthy"
    else
        print_error "Unhealthy"
    fi

    echo -n "Redis: "
    if docker compose exec -T redis redis-cli ping > /dev/null 2>&1; then
        print_status "Healthy"
    else
        print_error "Unhealthy"
    fi

    echo -n "Qdrant: "
    if curl -sf http://localhost:6333/healthz > /dev/null; then
        print_status "Healthy"
    else
        print_error "Unhealthy"
    fi
}

version() {
    print_header "VERSION INFORMATION"

    if [ -f "package.json" ]; then
        echo "App Version: $(node -p "require('./package.json').version" 2>/dev/null || echo 'Not set')"
    elif [ -f "frontend/package.json" ]; then
        echo "Frontend Version: $(node -p "require('./frontend/package.json').version" 2>/dev/null || echo 'Not set')"
    else
        echo "App Version: Not set"
    fi

    if git rev-parse --git-dir > /dev/null 2>&1; then
        echo "Git Commit: $(git rev-parse --short HEAD)"
        echo "Git Branch: $(git branch --show-current)"
    fi

    echo ""
    print_info "Local Docker images:"
    docker images | grep -E "(${APP_NAME}|agentsql|REPOSITORY)" | head -10 || true
}

metrics() {
    print_header "RESOURCE METRICS"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
}

clean() {
    print_header "CLEANING UP"
    print_warning "This will remove containers, images, and volumes for this project"

    read -p "Type YES to continue: " -r
    if [[ ! $REPLY == "YES" ]]; then
        print_info "Cancelled"
        exit 0
    fi

    print_status "Stopping services and removing volumes..."
    docker compose down -v --remove-orphans

    print_status "Removing project images..."
    docker images --format "{{.Repository}}:{{.Tag}}" | grep -E "^(agentsql|${APP_NAME})" | xargs -r docker rmi 2>/dev/null || true

    print_status "Cleaning build cache..."
    docker builder prune -a -f

    print_status "Cleaning unused Docker resources..."
    docker system prune -a -f --volumes

    print_header "CLEANUP COMPLETED"
}

cache() {
    print_header "CLEANING CACHE"
    print_warning "This will clear Docker build cache"

    read -p "Type YES to continue: " -r
    if [[ ! $REPLY == "YES" ]]; then
        print_info "Cancelled"
        exit 0
    fi

    docker builder prune -a -f
    docker system prune -f
    print_status "Cache cleaned"
}

prune() {
    print_status "Pruning unused Docker resources..."
    docker system prune -f
    print_status "Pruning completed"
}

help() {
    echo ""
    echo "=================================================================================================================="
    echo "                                     SQL AGENT - OPERATIONS CLI"
    echo "=================================================================================================================="
    echo ""

    echo "SERVICE TOPOLOGY"
    echo "  Services: frontend | backend(app) | redis | qdrant"
    echo ""

    echo "BUILD & DEPLOYMENT COMMANDS"
    echo "  init         - Build images and start stack (initial setup / dependency changes)"
    echo "  build        - Build images only (no startup)"
    echo "  rebuild      - Incremental rebuild (application changes only)"
    echo "  reload       - Restart services with latest containers (no rebuild)"
    echo ""

    echo "SERVICE LIFECYCLE MANAGEMENT"
    echo "  start        - Start all services"
    echo "  stop         - Gracefully stop all services"
    echo "  restart      - Restart all services"
    echo ""

    echo "OBSERVABILITY & MONITORING"
    echo "  logs [svc] [pool] - Stream logs (all services or specific service)"
    echo "                 Examples:"
    echo "                   ./sql-agent.sh logs                  # All services"
    echo "                   ./sql-agent.sh logs app              # Backend application"
    echo "                   ./sql-agent.sh logs frontend         # Next.js frontend"
    echo "                   ./sql-agent.sh logs redis            # Redis database"
    echo "                   ./sql-agent.sh logs qdrant           # Qdrant vector store"
    echo ""
    echo "  status       - Display container status and resource metrics"
    echo "  health       - Run application health checks"
    echo "  version      - Show app version, git commit, docker images"
    echo "  metrics      - Show container CPU/memory usage summary"
    echo ""

    echo "SYSTEM MAINTENANCE"
    echo "  clean        - Remove containers, images, volumes (destructive)"
    echo "  cache        - Clear Docker build cache"
    echo "  prune        - Remove unused Docker resources"
    echo ""
    exit 1
}

case "$1" in
    init)
        init
        ;;
    build)
        build
        ;;
    rebuild)
        rebuild
        ;;
    reload)
        reload
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs "$@"
        ;;
    status)
        status
        ;;
    health)
        health
        ;;
    version)
        version
        ;;
    metrics)
        metrics
        ;;
    clean)
        clean
        ;;
    cache)
        cache
        ;;
    prune)
        prune
        ;;
    *)
        help
        ;;
esac

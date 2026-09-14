#!/usr/bin/env bash
# ============================================================================
# Start All Services - AI Gateway Complete
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           AI Gateway Complete - Starting Services            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Start Turnstile Solver
log_step "1/4 Starting Turnstile Solver..."
cd "$PROJECT_DIR/components/turnstile-solver"
if [ -f "docker-compose.override.yml" ]; then
    docker compose -f docker-compose.override.yml up -d
    log_info "Turnstile Solver started on :8088"
else
    log_warn "No docker-compose.override.yml found, skipping"
fi

# 2. Start GrokBuild Proxy
log_step "2/4 Starting GrokBuild Proxy..."
cd "$PROJECT_DIR/components/grokbuild-proxy"
if command -v go &> /dev/null; then
    nohup go run . > /tmp/grokbuild-proxy.log 2>&1 &
    sleep 2
    log_info "GrokBuild Proxy started on :8090"
else
    log_warn "Go not installed, skipping GrokBuild Proxy"
fi

# 3. Start BlacklistedAIProxy
log_step "3/4 Starting BlacklistedAIProxy..."
cd "$PROJECT_DIR/components/blacklisted-ai-proxy"
if command -v pnpm &> /dev/null; then
    pnpm install --frozen-lockfile 2>/dev/null || true
    nohup pnpm start > /tmp/blacklisted-api.log 2>&1 &
    sleep 2
    log_info "BlacklistedAIProxy started on :3005"
else
    log_warn "pnpm not installed, skipping BlacklistedAIProxy"
fi

# 4. Health Check
log_step "4/4 Running health check..."
sleep 3

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                     Service Status                           ║"
echo "╠═══════════════════════════════════════════════════════════════╣"

# Check Turnstile Solver
if curl -sf -H "secret: turnstile123" http://localhost:8088/ > /dev/null 2>&1; then
    echo -e "║  ${GREEN}✓${NC} Turnstile Solver    :8088                          ║"
else
    echo -e "║  ${RED}✗${NC} Turnstile Solver    :8088                          ║"
fi

# Check GrokBuild Proxy
if curl -sf http://localhost:8090/health > /dev/null 2>&1; then
    echo -e "║  ${GREEN}✓${NC} GrokBuild Proxy     :8090                          ║"
else
    echo -e "║  ${RED}✗${NC} GrokBuild Proxy     :8090                          ║"
fi

# Check BlacklistedAIProxy
if curl -sf http://localhost:3005/ > /dev/null 2>&1; then
    echo -e "║  ${GREEN}✓${NC} BlacklistedAIProxy  :3005                          ║"
else
    echo -e "║  ${RED}✗${NC} BlacklistedAIProxy  :3005                          ║"
fi

echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
log_info "All services started!"

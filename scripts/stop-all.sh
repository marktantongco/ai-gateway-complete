#!/usr/bin/env bash
# ============================================================================
# Stop All Services - AI Gateway Complete
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
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           AI Gateway Complete - Stopping Services            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Stop BlacklistedAIProxy
log_step "1/4 Stopping BlacklistedAIProxy..."
pkill -f "pnpm start" 2>/dev/null || true
pkill -f "blacklisted-ai-proxy" 2>/dev/null || true
log_info "BlacklistedAIProxy stopped"

# 2. Stop GrokBuild Proxy
log_step "2/4 Stopping GrokBuild Proxy..."
pkill -f "go run.*grokbuild" 2>/dev/null || true
pkill -f "grokbuild-proxy" 2>/dev/null || true
log_info "GrokBuild Proxy stopped"

# 3. Stop Turnstile Solver
log_step "3/4 Stopping Turnstile Solver..."
cd "$PROJECT_DIR/components/turnstile-solver"
if [ -f "docker-compose.override.yml" ]; then
    docker compose -f docker-compose.override.yml down
fi
log_info "Turnstile Solver stopped"

# 4. Verify
log_step "4/4 Verifying..."
sleep 2

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                   All Services Stopped                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

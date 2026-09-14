#!/usr/bin/env bash
# ============================================================================
# Refresh Proxies - AI Gateway Complete
# ============================================================================

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              Refreshing SOCKS5 Proxies                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROXY_FILE="$PROJECT_DIR/components/turnstile-solver/proxies.txt"

# Backup current proxies
if [ -f "$PROXY_FILE" ]; then
    cp "$PROXY_FILE" "$PROXY_FILE.bak"
    log_info "Backed up current proxies"
fi

# Fetch fresh proxies
log_step "Fetching fresh proxies from multiple sources..."

{
    curl -s "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" | grep -v '^#' | head -50
    curl -s "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt" | grep -v '^#' | head -50
    curl -s "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt" | grep -v '^#' | head -50
} | sort -u > "$PROXY_FILE"

# Count proxies
PROXY_COUNT=$(wc -l < "$PROXY_FILE")
log_info "Loaded $PROXY_COUNT proxies"

# Restart turnstile solver if running
if docker ps | grep -q turnstile; then
    log_step "Restarting Turnstile Solver..."
    cd "$PROJECT_DIR/components/turnstile-solver"
    docker compose -f docker-compose.override.yml restart
    log_info "Turnstile Solver restarted"
fi

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    Proxy Refresh Complete                    ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Proxies loaded: $PROXY_COUNT                                        ║"
echo "║  File: $PROXY_FILE                        ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

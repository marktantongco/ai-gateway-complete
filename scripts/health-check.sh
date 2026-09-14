#!/usr/bin/env bash
# ============================================================================
# Health Check - AI Gateway Complete
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              AI Gateway Complete - Health Check              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Service checks
declare -A SERVICES=(
    ["Turnstile Solver"]="http://localhost:8088/"
    ["GrokBuild Proxy"]="http://localhost:8090/health"
    ["BlacklistedAIProxy"]="http://localhost:3005/"
)

ALL_HEALTHY=true

for SERVICE in "${!SERVICES[@]}"; do
    URL="${SERVICES[$SERVICE]}"
    
    if curl -sf -H "secret: turnstile123" "$URL" > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} $SERVICE"
    else
        echo -e "  ${RED}✗${NC} $SERVICE"
        ALL_HEALTHY=false
    fi
done

# Docker check
echo ""
echo -e "${BLUE}Docker Containers:${NC}"
if docker ps | grep -q turnstile; then
    echo -e "  ${GREEN}✓${NC} Turnstile Solver container running"
else
    echo -e "  ${RED}✗${NC} Turnstile Solver container not running"
    ALL_HEALTHY=false
fi

# Proxy count
echo ""
echo -e "${BLUE}Proxy Status:${NC}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PROXY_FILE="$PROJECT_DIR/components/turnstile-solver/proxies.txt"

if [ -f "$PROXY_FILE" ]; then
    PROXY_COUNT=$(wc -l < "$PROXY_FILE")
    echo -e "  ${GREEN}✓${NC} $PROXY_COUNT proxies loaded"
else
    echo -e "  ${YELLOW}!${NC} No proxy file found"
fi

# Summary
echo ""
if [ "$ALL_HEALTHY" = true ]; then
    echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                   All Services Healthy                       ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                  Some Services Unhealthy                     ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════╝${NC}"
fi
echo ""

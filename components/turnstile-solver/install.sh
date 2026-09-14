#!/usr/bin/env bash
# ============================================================================
#
#   ████████╗███╗   ███╗ █████╗ ███╗   ██╗ ██████╗████████╗██████╗ ██╗
#   ╚══██╔══╝████╗ ████║██╔══██╗████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██║
#      ██║   ██╔████╔██║███████║██╔██╗ ██║██║        ██║   ██████╔╝██║
#      ██║   ██║╚██╔╝██║██╔══██║██║╚██╗██║██║        ██║   ██╔══██╗██║
#      ██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║╚██████╗   ██║   ██║  ██║███████╗
#      ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝
#
#   Turnstile Solver - Complete Installer for Omarchy Linux
#   Version: 3.16
#   Author: marktantongco
#   License: MIT
#
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
readonly VERSION="3.16"
readonly REPO_URL="https://github.com/marktantongco/turnstile-solver.git"
readonly INSTALL_DIR="${HOME}/.local/share/turnstile-solver"
readonly SERVICE_DIR="${HOME}/.config/systemd/user"
readonly PROXY_REFRESH_INTERVAL=6  # hours

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m' # No Color

# ============================================================================
# Helper Functions
# ============================================================================

print_banner() {
    clear
    echo -e "${CYAN}"
    cat << 'BANNER'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ████████╗███╗   ███╗ █████╗ ███╗   ██╗ ██████╗████████╗   ║
    ║   ╚══██╔══╝████╗ ████║██╔══██╗████╗  ██║██╔════╝╚══██╔══╝   ║
    ║      ██║   ██╔████╔██║███████║██╔██╗ ██║██║        ██║      ║
    ║      ██║   ██║╚██╔╝██║██╔══██║██║╚██╗██║██║        ██║      ║
    ║      ██║   ██║ ╚═╝ ██║██║  ██║██║ ╚████║╚██████╗   ██║      ║
    ║      ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝   ╚═╝      ║
    ║                                                               ║
    ║   Turnstile Solver Installer for Omarchy Linux               ║
    ║   Version: 3.16                                              ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}"
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

confirm() {
    local prompt="$1"
    local default="${2:-y}"
    
    if [[ "$default" == "y" ]]; then
        prompt="$prompt [Y/n]: "
    else
        prompt="$prompt [y/N]: "
    fi
    
    read -rp "$prompt" response
    response="${response:-$default}"
    
    [[ "$response" =~ ^[Yy]$ ]]
}

# ============================================================================
# System Checks
# ============================================================================

check_system() {
    log_step "Checking system requirements..."
    
    # Check OS
    if ! grep -qi "arch\|omarchy" /etc/os-release 2>/dev/null; then
        log_warn "This installer is optimized for Omarchy/Arch Linux"
        if ! confirm "Continue anyway?"; then
            exit 1
        fi
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        log_info "Install Docker: sudo pacman -S docker"
        log_info "Then start: sudo systemctl enable --now docker"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed"
        log_info "Install: sudo pacman -S docker-compose"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        log_info "Install: sudo pacman -S git"
        exit 1
    fi
    
    # Check user in docker group
    if ! groups "$USER" | grep -q docker; then
        log_warn "User '$USER' is not in docker group"
        log_info "Add user to docker group: sudo usermod -aG docker $USER"
        log_info "Then logout and login again"
        
        if confirm "Continue anyway?"; then
            log_warn "Using sudo for Docker commands"
            DOCKER_CMD="sudo docker"
        else
            exit 1
        fi
    else
        DOCKER_CMD="docker"
    fi
    
    # Check available disk space
    local available_gb
    available_gb=$(df -BG "$HOME" | awk 'NR==2 {print $4}' | tr -d 'G')
    
    if [[ "$available_gb" -lt 5 ]]; then
        log_warn "Low disk space: ${available_gb}GB available (5GB recommended)"
    fi
    
    log_info "System checks passed ✓"
}

# ============================================================================
# Installation
# ============================================================================

install_dependencies() {
    log_step "Installing system dependencies..."
    
    local packages=(
        "docker"
        "docker-compose"
        "git"
        "curl"
        "jq"
        "base-devel"
    )
    
    for pkg in "${packages[@]}"; do
        if ! pacman -Qi "$pkg" &> /dev/null; then
            log_info "Installing $pkg..."
            sudo pacman -S --noconfirm "$pkg"
        fi
    done
    
    # Enable Docker service
    if ! systemctl is-active docker &> /dev/null; then
        log_info "Enabling Docker service..."
        sudo systemctl enable --now docker
    fi
    
    log_info "Dependencies installed ✓"
}

clone_repository() {
    log_step "Cloning turnstile-solver repository..."
    
    if [[ -d "$INSTALL_DIR" ]]; then
        log_warn "Installation directory already exists: $INSTALL_DIR"
        
        if confirm "Update existing installation?"; then
            cd "$INSTALL_DIR"
            git pull origin main
        else
            log_info "Skipping clone"
            return
        fi
    else
        mkdir -p "$(dirname "$INSTALL_DIR")"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    
    log_info "Repository cloned ✓"
}

build_docker_image() {
    log_step "Building Docker image..."
    
    cd "$INSTALL_DIR"
    
    # Build using the override file
    $DOCKER_CMD compose -f docker-compose.override.yml build
    
    log_info "Docker image built ✓"
}

setup_proxies() {
    log_step "Setting up proxy rotation..."
    
    cd "$INSTALL_DIR"
    
    # Check if proxies.txt exists and has content
    if [[ ! -f "proxies.txt" ]] || [[ $(wc -l < proxies.txt) -lt 10 ]]; then
        log_info "Fetching initial proxy list..."
        
        # Fetch from multiple sources
        {
            curl -s "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" | grep -v '^#' | head -50
            curl -s "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt" | grep -v '^#' | head -50
            curl -s "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt" | grep -v '^#' | head -50
        } | sort -u > proxies.txt
        
        local proxy_count
        proxy_count=$(wc -l < proxies.txt)
        log_info "Loaded $proxy_count proxies ✓"
    else
        log_info "Proxies already configured"
    fi
}

create_systemd_service() {
    log_step "Creating systemd user service..."
    
    mkdir -p "$SERVICE_DIR"
    
    cat > "$SERVICE_DIR/turnstile-solver.service" << EOF
[Unit]
Description=Turnstile Solver Docker Container
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStartPre=${DOCKER_CMD} compose -f docker-compose.override.yml up -d
ExecStart=${DOCKER_CMD} compose -f docker-compose.override.yml logs -f
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

    # Reload systemd
    systemctl --user daemon-reload
    
    # Enable service
    systemctl --user enable turnstile-solver
    
    log_info "Systemd service created ✓"
}

create_proxy_refresh_timer() {
    log_step "Creating proxy refresh timer..."
    
    # Create timer unit
    cat > "$SERVICE_DIR/turnstile-proxy-refresh.timer" << EOF
[Unit]
Description=Refresh Turnstile Solver Proxies

[Timer]
OnCalendar=*-*-* 0/${PROXY_REFRESH_INTERVAL}:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    # Create service unit
    cat > "$SERVICE_DIR/turnstile-proxy-refresh.service" << EOF
[Unit]
Description=Refresh Turnstile Solver Proxies
After=docker.service

[Service]
Type=oneshot
WorkingDirectory=${INSTALL_DIR}
ExecStart=/bin/bash -c 'curl -s "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" | grep -v "^#" | head -100 > proxies_new.txt && cat proxies_new.txt proxies.txt | sort -u > proxies_merged.txt && mv proxies_merged.txt proxies.txt && rm -f proxies_new.txt && ${DOCKER_CMD} compose -f docker-compose.override.yml restart'
EOF

    # Reload and enable
    systemctl --user daemon-reload
    systemctl --user enable turnstile-proxy-refresh.timer
    systemctl --user start turnstile-proxy-refresh.timer
    
    log_info "Proxy refresh timer created (every ${PROXY_REFRESH_INTERVAL} hours) ✓"
}

setup_environment() {
    log_step "Setting up environment..."
    
    cd "$INSTALL_DIR"
    
    # Create .env file if it doesn't exist
    if [[ ! -f ".env" ]]; then
        cat > .env << 'EOF'
# Turnstile Solver Configuration
SOLVER_PORT=8088
SOLVER_SECRET=turnstile123
MAX_ATTEMPTS=3
CAPTCHA_TIMEOUT=30
PAGE_LOAD_TIMEOUT=30

# 2Captcha Fallback (optional)
# TWOCAPTCHA_KEY=your_key_here
EOF
        log_info "Created default .env file"
    fi
    
    # Create refresh script
    cat > refresh-proxies.sh << 'REFRESH'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "Refreshing proxies..."

# Fetch fresh proxies
{
    curl -s "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" | grep -v '^#' | head -50
    curl -s "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt" | grep -v '^#' | head -50
    curl -s "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt" | grep -v '^#' | head -50
} | sort -u > proxies_new.txt

# Merge with existing
cat proxies_new.txt proxies.txt | sort -u > proxies_merged.txt
mv proxies_merged.txt proxies.txt
rm -f proxies_new.txt

echo "Proxies refreshed: $(wc -l < proxies.txt) total"

# Restart solver
docker compose -f docker-compose.override.yml restart
REFRESH

    chmod +x refresh-proxies.sh
    
    log_info "Environment setup ✓"
}

start_service() {
    log_step "Starting Turnstile Solver..."
    
    cd "$INSTALL_DIR"
    
    # Start container
    $DOCKER_CMD compose -f docker-compose.override.yml up -d
    
    # Wait for healthy status
    log_info "Waiting for container to become healthy..."
    local max_wait=30
    local waited=0
    
    while [[ $waited -lt $max_wait ]]; do
        if $DOCKER_CMD compose -f docker-compose.override.yml ps | grep -q "healthy"; then
            break
        fi
        sleep 1
        ((waited++))
    done
    
    # Test health endpoint
    if curl -sf -H "secret: turnstile123" http://localhost:8088/ > /dev/null 2>&1; then
        log_info "Service started and healthy ✓"
    else
        log_warn "Service started but health check failed"
        log_info "Check logs: docker compose -f docker-compose.override.yml logs"
    fi
}

# ============================================================================
# Verification
# ============================================================================

verify_installation() {
    log_step "Verifying installation..."
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    Installation Summary                      ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check container status
    cd "$INSTALL_DIR"
    if $DOCKER_CMD compose -f docker-compose.override.yml ps | grep -q "running"; then
        echo -e "  ${GREEN}✓${NC} Container:     ${GREEN}Running${NC}"
    else
        echo -e "  ${RED}✗${NC} Container:     ${RED}Not Running${NC}"
    fi
    
    # Check health endpoint
    if curl -sf -H "secret: turnstile123" http://localhost:8088/ > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} Health:        ${GREEN}OK${NC}"
    else
        echo -e "  ${RED}✗${NC} Health:        ${RED}Failed${NC}"
    fi
    
    # Check proxy count
    local proxy_count
    proxy_count=$(wc -l < "$INSTALL_DIR/proxies.txt" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}✓${NC} Proxies:       ${proxy_count} loaded"
    
    # Check systemd service
    if systemctl --user is-enabled turnstile-solver &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Service:       ${GREEN}Enabled${NC}"
    else
        echo -e "  ${YELLOW}!${NC} Service:       Not enabled"
    fi
    
    # Check timer
    if systemctl --user is-enabled turnstile-proxy-refresh.timer &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} Auto-refresh:  ${GREEN}Every ${PROXY_REFRESH_INTERVAL}h${NC}"
    else
        echo -e "  ${YELLOW}!${NC} Auto-refresh:  Not configured"
    fi
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                      Quick Commands                          ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Test:                                                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    curl -H \"secret: turnstile123\" http://localhost:8088/    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  View logs:                                                 ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose -f docker-compose.override.yml logs -f    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Restart:                                                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose -f docker-compose.override.yml restart    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Refresh proxies:                                           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    ./refresh-proxies.sh                                    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Stop service:                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    systemctl --user stop turnstile-solver                   ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ============================================================================
# Uninstaller
# ============================================================================

uninstall() {
    log_step "Uninstalling Turnstile Solver..."
    
    # Stop and disable services
    systemctl --user stop turnstile-solver 2>/dev/null || true
    systemctl --user disable turnstile-solver 2>/dev/null || true
    systemctl --user stop turnstile-proxy-refresh.timer 2>/dev/null || true
    systemctl --user disable turnstile-proxy-refresh.timer 2>/dev/null || true
    
    # Stop container
    cd "$INSTALL_DIR" 2>/dev/null && {
        $DOCKER_CMD compose -f docker-compose.override.yml down 2>/dev/null || true
    }
    
    # Remove files
    rm -rf "$INSTALL_DIR"
    rm -f "$SERVICE_DIR/turnstile-solver.service"
    rm -f "$SERVICE_DIR/turnstile-proxy-refresh.timer"
    rm -f "$SERVICE_DIR/turnstile-proxy-refresh.service"
    
    systemctl --user daemon-reload
    
    log_info "Uninstalled successfully ✓"
}

# ============================================================================
# Main
# ============================================================================

main() {
    print_banner
    
    # Parse arguments
    case "${1:-}" in
        uninstall|remove)
            uninstall
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [uninstall]"
            echo ""
            echo "Options:"
            echo "  (no args)    Install Turnstile Solver"
            echo "  uninstall    Remove Turnstile Solver"
            echo "  --help       Show this help"
            exit 0
            ;;
    esac
    
    echo -e "${WHITE}This installer will:${NC}"
    echo ""
    echo "  1. Install Docker dependencies (if needed)"
    echo "  2. Clone turnstile-solver repository"
    echo "  3. Build Docker container with Chromium"
    echo "  4. Fetch and configure SOCKS5 proxies"
    echo "  5. Create systemd user service"
    echo "  6. Set up automatic proxy refresh (every ${PROXY_REFRESH_INTERVAL}h)"
    echo "  7. Start and verify the service"
    echo ""
    
    if ! confirm "Proceed with installation?"; then
        echo "Installation cancelled."
        exit 0
    fi
    
    echo ""
    
    check_system
    install_dependencies
    clone_repository
    build_docker_image
    setup_proxies
    setup_environment
    create_systemd_service
    create_proxy_refresh_timer
    start_service
    verify_installation
    
    echo ""
    log_info "Installation complete! 🎉"
    echo ""
}

main "$@"

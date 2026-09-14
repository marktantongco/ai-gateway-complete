#!/usr/bin/env bash
# ============================================================================
#
#   AI Gateway Complete - Installer for Omarchy Linux
#   Version: 1.0.0
#   Author: marktantongco
#   License: MIT
#
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================
readonly VERSION="1.0.0"
readonly REPO_URL="https://github.com/marktantongco/ai-gateway-complete.git"
readonly INSTALL_DIR="${HOME}/.local/share/ai-gateway-complete"
readonly SERVICE_DIR="${HOME}/.config/systemd/user"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

# ============================================================================
# Helper Functions
# ============================================================================

print_banner() {
    clear
    echo -e "${CYAN}"
    cat << 'BANNER'
    ╔═══════════════════════════════════════════════════════════════╗
    ║                                                               ║
    ║   ████████╗██╗   ██╗██████╗ ██╗████████╗███████╗            ║
    ║   ╚══██╔══╝██║   ██║██╔══██╗██║╚══██╔══╝██╔════╝            ║
    ║      ██║   ██║   ██║██████╔╝██║   ██║   █████╗              ║
    ║      ██║   ██║   ██║██╔══██╗██║   ██║   ██╔══╝              ║
    ║      ██║   ╚██████╔╝██║  ██║██║   ██║   ███████╗            ║
    ║      ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝            ║
    ║                                                               ║
    ║   Complete AI Gateway Stack Installer                        ║
    ║   Version: 1.0.0                                            ║
    ║                                                               ║
    ╚═══════════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}"
}

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

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
    
    # Check Go
    if ! command -v go &> /dev/null; then
        log_error "Go is not installed"
        log_info "Install: sudo pacman -S go"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        log_info "Install: sudo pacman -S nodejs npm"
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
    
    if [[ "$available_gb" -lt 10 ]]; then
        log_warn "Low disk space: ${available_gb}GB available (10GB recommended)"
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
        "go"
        "nodejs"
        "npm"
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
    log_step "Cloning ai-gateway-complete repository..."
    
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

build_docker_images() {
    log_step "Building Docker images..."
    
    cd "$INSTALL_DIR"
    
    # Build turnstile solver
    log_info "Building Turnstile Solver..."
    $DOCKER_CMD compose build turnstile-solver
    
    log_info "Docker images built ✓"
}

setup_proxies() {
    log_step "Setting up proxy rotation..."
    
    cd "$INSTALL_DIR"
    
    # Check if proxies.txt exists and has content
    local proxy_file="components/turnstile-solver/proxies.txt"
    
    if [[ ! -f "$proxy_file" ]] || [[ $(wc -l < "$proxy_file") -lt 10 ]]; then
        log_info "Fetching initial proxy list..."
        
        # Fetch from multiple sources
        {
            curl -s "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt" | grep -v '^#' | head -50
            curl -s "https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt" | grep -v '^#' | head -50
            curl -s "https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt" | grep -v '^#' | head -50
        } | sort -u > "$proxy_file"
        
        local proxy_count
        proxy_count=$(wc -l < "$proxy_file")
        log_info "Loaded $proxy_count proxies ✓"
    else
        log_info "Proxies already configured"
    fi
}

create_systemd_services() {
    log_step "Creating systemd user services..."
    
    mkdir -p "$SERVICE_DIR"
    
    # Turnstile Solver service
    cat > "$SERVICE_DIR/turnstile-solver.service" << EOF
[Unit]
Description=Turnstile Solver Docker
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/components/turnstile-solver
ExecStartPre=${DOCKER_CMD} compose -f docker-compose.override.yml up -d
ExecStart=${DOCKER_CMD} compose -f docker-compose.override.yml logs -f
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

    # GrokBuild Proxy service
    cat > "$SERVICE_DIR/grokbuild-proxy.service" << EOF
[Unit]
Description=GrokBuild Proxy
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/components/grokbuild-proxy
ExecStart=/usr/bin/go run .
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

    # BlacklistedAIProxy service
    cat > "$SERVICE_DIR/blacklisted-api.service" << EOF
[Unit]
Description=BlacklistedAIProxy
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}/components/blacklisted-ai-proxy
ExecStart=/usr/bin/pnpm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

    # Reload systemd
    systemctl --user daemon-reload
    
    # Enable services
    systemctl --user enable turnstile-solver
    systemctl --user enable grokbuild-proxy
    systemctl --user enable blacklisted-api
    
    log_info "Systemd services created ✓"
}

setup_environment() {
    log_step "Setting up environment..."
    
    cd "$INSTALL_DIR"
    
    # Create .env file if it doesn't exist
    if [[ ! -f ".env" ]]; then
        cat > .env << 'EOF'
# AI Gateway Complete Configuration

# Turnstile Solver
SOLVER_PORT=8088
SOLVER_SECRET=turnstile123
MAX_ATTEMPTS=3
CAPTCHA_TIMEOUT=30

# 2Captcha Fallback (optional)
# TWOCAPTCHA_KEY=your_key_here

# BlacklistedAIProxy
PORT=3005
EOF
        log_info "Created default .env file"
    fi
    
    log_info "Environment setup ✓"
}

start_services() {
    log_step "Starting services..."
    
    cd "$INSTALL_DIR"
    
    # Start turnstile solver first
    log_info "Starting Turnstile Solver..."
    $DOCKER_CMD compose up -d turnstile-solver
    
    # Wait for healthy status
    log_info "Waiting for Turnstile Solver to become healthy..."
    local max_wait=30
    local waited=0
    
    while [[ $waited -lt $max_wait ]]; do
        if $DOCKER_CMD compose ps turnstile-solver | grep -q "healthy"; then
            break
        fi
        sleep 1
        ((waited++))
    done
    
    log_info "Turnstile Solver started ✓"
    
    # Start other services
    log_info "Starting other services..."
    $DOCKER_CMD compose up -d
    
    log_info "All services started ✓"
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
    
    if $DOCKER_CMD compose ps turnstile-solver | grep -q "running"; then
        echo -e "  ${GREEN}✓${NC} Turnstile Solver    :8088    ${GREEN}Running${NC}"
    else
        echo -e "  ${RED}✗${NC} Turnstile Solver    :8088    ${RED}Not Running${NC}"
    fi
    
    if curl -sf http://localhost:8090/health > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} GrokBuild Proxy     :8090    ${GREEN}Running${NC}"
    else
        echo -e "  ${RED}✗${NC} GrokBuild Proxy     :8090    ${RED}Not Running${NC}"
    fi
    
    if curl -sf http://localhost:3005/ > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} BlacklistedAIProxy  :3005    ${GREEN}Running${NC}"
    else
        echo -e "  ${RED}✗${NC} BlacklistedAIProxy  :3005    ${RED}Not Running${NC}"
    fi
    
    # Check proxy count
    local proxy_count
    proxy_count=$(wc -l < "$INSTALL_DIR/components/turnstile-solver/proxies.txt" 2>/dev/null || echo "0")
    echo -e "  ${GREEN}✓${NC} Proxies loaded:     $proxy_count"
    
    # Check systemd services
    echo ""
    echo -e "${CYAN}Systemd Services:${NC}"
    
    for service in turnstile-solver grokbuild-proxy blacklisted-api; do
        if systemctl --user is-enabled "$service" &> /dev/null; then
            echo -e "  ${GREEN}✓${NC} $service: Enabled"
        else
            echo -e "  ${YELLOW}!${NC} $service: Not enabled"
        fi
    done
    
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                      Quick Commands                          ║${NC}"
    echo -e "${CYAN}╠═══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Health check:                                                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    ./scripts/health-check.sh                                  ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Start all:                                                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    ./scripts/start-all.sh                                     ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Stop all:                                                    ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    ./scripts/stop-all.sh                                      ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Refresh proxies:                                             ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    ./scripts/refresh-proxies.sh                               ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}                                                              ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  View logs:                                                   ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}    docker compose logs -f                                     ${CYAN}║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

# ============================================================================
# Uninstaller
# ============================================================================

uninstall() {
    log_step "Uninstalling AI Gateway Complete..."
    
    # Stop and disable services
    systemctl --user stop turnstile-solver 2>/dev/null || true
    systemctl --user disable turnstile-solver 2>/dev/null || true
    systemctl --user stop grokbuild-proxy 2>/dev/null || true
    systemctl --user disable grokbuild-proxy 2>/dev/null || true
    systemctl --user stop blacklisted-api 2>/dev/null || true
    systemctl --user disable blacklisted-api 2>/dev/null || true
    
    # Stop container
    cd "$INSTALL_DIR" 2>/dev/null && {
        $DOCKER_CMD compose down 2>/dev/null || true
    }
    
    # Remove files
    rm -rf "$INSTALL_DIR"
    rm -f "$SERVICE_DIR/turnstile-solver.service"
    rm -f "$SERVICE_DIR/grokbuild-proxy.service"
    rm -f "$SERVICE_DIR/blacklisted-api.service"
    
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
            echo "  (no args)    Install AI Gateway Complete"
            echo "  uninstall    Remove AI Gateway Complete"
            echo "  --help       Show this help"
            exit 0
            ;;
    esac
    
    echo -e "${WHITE}This installer will:${NC}"
    echo ""
    echo "  1. Install Docker, Go, Node.js dependencies"
    echo "  2. Clone ai-gateway-complete repository"
    echo "  3. Build Docker containers"
    echo "  4. Fetch and configure SOCKS5 proxies"
    echo "  5. Create systemd user services"
    echo "  6. Start and verify all services"
    echo ""
    
    if ! confirm "Proceed with installation?"; then
        echo "Installation cancelled."
        exit 0
    fi
    
    echo ""
    
    check_system
    install_dependencies
    clone_repository
    build_docker_images
    setup_proxies
    setup_environment
    create_systemd_services
    start_services
    verify_installation
    
    echo ""
    log_info "Installation complete! 🎉"
    echo ""
}

main "$@"

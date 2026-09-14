# 📦 Installation Guide

## Prerequisites

### System Requirements

```
┌─────────────────────────────────────────────────────────────┐
│  MINIMUM REQUIREMENTS                                       │
├─────────────────────────────────────────────────────────────┤
│  OS: Linux (Ubuntu 20.04+, Debian 11+, Omarchy)            │
│  RAM: 2GB (4GB recommended)                                 │
│  CPU: 2 cores (4 recommended)                               │
│  Disk: 5GB free space                                       │
│  Network: Internet access for proxy fetching                │
└─────────────────────────────────────────────────────────────┘
```

### Required Software

| Software | Version | Install Command |
|----------|---------|-----------------|
| Docker | 20.10+ | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | v2+ | Included with Docker |
| Git | 2.0+ | `sudo apt install git` |

## Installation Methods

### Method 1: Docker (Recommended)

#### Step 1: Clone Repository

```bash
git clone https://github.com/marktantongco/turnstile-solver.git
cd turnstile-solver
```

#### Step 2: Build Docker Image

```bash
sudo docker compose -f docker-compose.override.yml build
```

#### Step 3: Start Container

```bash
sudo docker compose -f docker-compose.override.yml up -d
```

#### Step 4: Verify Installation

```bash
# Check container status
sudo docker ps | grep turnstile

# Test health endpoint
curl -H "secret: turnstile123" http://localhost:8088/
```

**Expected Output:**
```json
{"status": "ok"}
```

### Method 2: Python (Development)

#### Step 1: Create Virtual Environment

```bash
python3 -m venv .venv
source .venv/bin/activate
```

#### Step 2: Install Dependencies

```bash
pip install git+https://github.com/odell0111/turnstile_solver@main
patchright install chromium --with-deps
```

#### Step 3: Run Solver

```bash
solver --port 8088 --secret turnstile123 --browser chromium --headless
```

### Method 3: Systemd Service

#### Step 1: Install Docker Methods First

Complete Method 1 steps 1-3.

#### Step 2: Create Systemd Service

```bash
sudo tee /etc/systemd/system/turnstile-solver.service > /dev/null << 'EOF'
[Unit]
Description=Turnstile Solver Docker
After=docker.service
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=/home/x3/workspace/turnstile_solver
ExecStartPre=/usr/bin/docker compose -f docker-compose.override.yml up -d
ExecStart=/usr/bin/docker compose -f docker-compose.override.yml logs -f
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

#### Step 3: Enable and Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable turnstile-solver
sudo systemctl start turnstile-solver
```

## 🔄 Proxy Setup

### Initial Proxy Load

The installer automatically fetches proxies from:

| Source | URL | Update Frequency |
|--------|-----|------------------|
| monosans | `raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt` | Hourly |
| VPSLabCloud | `raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt` | 15 min |
| proxifly | `raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.txt` | 5 min |

### Refresh Proxies

```bash
# Manual refresh
curl -s https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt \
  | grep -v '^#' | sort -u | head -100 > proxies_new.txt
cat proxies_new.txt proxies.txt | sort -u > proxies_merged.txt
mv proxies_merged.txt proxies.txt

# Restart to load new proxies
sudo docker compose -f docker-compose.override.yml restart
```

## ⚙️ Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLVER_PORT` | `8088` | Server port |
| `SOLVER_SECRET` | `turnstile123` | API authentication key |
| `MAX_ATTEMPTS` | `3` | Maximum solve attempts |
| `CAPTCHA_TIMEOUT` | `30` | Timeout for Turnstile (seconds) |
| `TWOCAPTCHA_KEY` | (none) | 2Captcha API key for fallback |

### Docker Compose Override

Edit `docker-compose.override.yml`:

```yaml
services:
  turnstile-solver:
    environment:
      - SOLVER_SECRET=your-secure-key
      - TWOCAPTCHA_KEY=your-2captcha-key
      - MAX_ATTEMPTS=5
    volumes:
      - ./proxies.txt:/app/proxies.txt:ro
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: "4"
```

## 🔐 Security Considerations

1. **Change Default Secret**: Always change `turnstile123` to a secure key
2. **Firewall**: Restrict port 8088 to trusted IPs
3. **HTTPS**: Use a reverse proxy (nginx, caddy) for TLS
4. **2Captcha Key**: Store securely, never commit to git

## ✅ Post-Installation Checklist

- [ ] Container running and healthy
- [ ] Health endpoint responds
- [ ] Proxies loaded (check logs)
- [ ] Test solve works
- [ ] Systemd service enabled (if using)
- [ ] Firewall configured
- [ ] Default secret changed

## 🆘 Next Steps

- [Proxy Management](proxy-management.md) - Learn about proxy rotation
- [API Reference](../api/reference.md) - Complete API docs
- [Troubleshooting](../troubleshooting/common-issues.md) - Fix issues

<div align="center">

```
    ██╗      █████╗ ██████╗  ██████╗ ███╗   ███╗ █████╗ ███╗   ██╗████████╗███████╗
    ██║     ██╔══██╗██╔══██╗██╔═══██╗████╗ ████║██╔══██╗████╗  ██║╚══██╔══╝██╔════╝
    ██║     ███████║██████╔╝██║   ██║██╔████╔██║███████║██╔██╗ ██║   ██║   █████╗  
    ██║     ██╔══██║██╔══██╗██║   ██║██║╚██╔╝██║██╔══██║██║╚██╗██║   ██║   ██╔══╝  
    ███████╗██║  ██║██████╔╝╚██████╔╝██║ ╚═╝ ██║██║  ██║██║ ╚████║   ██║   ███████╗
    ╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝
```

# 🛡️ AI Gateway Complete

**Full-stack AI gateway with Grok integration, Turnstile solving, and multi-account support**

[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Go](https://img.shields.io/badge/Go-00ADD8?style=for-the-badge&logo=go&logoColor=white)](https://golang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         COMPLETE AI GATEWAY STACK                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │ Blacklisted │  │  GrokBuild  │  │  Turnstile  │  │  Grok       │       │
│  │ AI Proxy    │  │  Proxy      │  │  Solver     │  │  Register   │       │
│  │ (:3005)     │  │  (:8090)    │  │  (:8088)    │  │             │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
│         │                │                │                │                │
│         └────────────────┴────────────────┴────────────────┘                │
│                              │                                             │
│                              ▼                                             │
│                    ┌─────────────────┐                                     │
│                    │    Grok API     │                                     │
│                    │    (x.ai)       │                                     │
│                    └─────────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

</div>

---

## ⚡ Quick Start

### Clone and Start

```bash
# Clone the repository
git clone https://github.com/marktantongco/ai-gateway-complete.git
cd ai-gateway-complete

# Start all services
./scripts/start-all.sh
```

### Verify Installation

```bash
# Check all services are running
./scripts/health-check.sh
```

### Access Services

| Service | URL | Description |
|---------|-----|-------------|
| **BlacklistedAIProxy** | http://localhost:3005 | Web UI + Chat |
| **GrokBuild Proxy** | http://localhost:8090 | API Endpoint |
| **Turnstile Solver** | http://localhost:8088 | Health Check |

---

## 🔄 Proxy Refresh (Do This First!)

> **⚠️ IMPORTANT: Free proxies die fast. Refresh before each use.**

```bash
# Auto-refresh: fetch fresh SOCKS5 proxies
./scripts/refresh-proxies.sh
```

### 📊 Proxy Sources Matrix

| Source | Stars | Update Freq | Reliability | Protocol |
|--------|-------|-------------|-------------|----------|
| `monosans/proxy-list` | ⭐⭐⭐⭐ | Hourly | 🟢 High | SOCKS5 |
| `VPSLabCloud/VPSLab-Free-Proxy-List` | ⭐⭐⭐ | 15 min | 🟢 High | SOCKS5 |
| `proxifly/free-proxy-list` | ⭐⭐⭐⭐⭐ | 5 min | 🟡 Medium | SOCKS5 |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REQUEST FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Client Request                                                            │
│       │                                                                    │
│       ▼                                                                    │
│  ┌─────────────────┐                                                      │
│  │  BlacklistedAI  │  ← Web UI, Chat, API Routing                        │
│  │  Proxy (:3005)  │                                                      │
│  └────────┬────────┘                                                      │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                      │
│  │  GrokBuild      │  ← Multi-account, Token Rotation                    │
│  │  Proxy (:8090)  │                                                      │
│  └────────┬────────┘                                                      │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐    ┌─────────────────┐                              │
│  │  Turnstile      │───▶│  2Captcha       │  ← Fallback                  │
│  │  Solver (:8088) │    │  API            │                              │
│  └────────┬────────┘    └─────────────────┘                              │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                      │
│  │  Grok Register  │  ← Account Farming, OAuth Minting                   │
│  └────────┬────────┘                                                      │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                      │
│  │  Grok API       │  ← x.ai Backend                                     │
│  └─────────────────┘                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Components

| Component | Language | Port | Description |
|-----------|----------|------|-------------|
| **BlacklistedAIProxy** | Node.js | 3005 | Web UI + API gateway |
| **GrokBuild Proxy** | Go | 8090 | Grok API proxy + multi-account |
| **Turnstile Solver** | Python | 8088 | Cloudflare Turnstile solver |
| **Grok Register** | Python | - | Account registration + OAuth |

---

## 🔗 Ecosystem Repositories

### Core Stack

| Repository | Description | Status |
|------------|-------------|--------|
| [ai-gateway-complete](https://github.com/marktantongco/ai-gateway-complete) | Full-stack combined repo | ✅ Active |
| [ai-gateway-stack](https://github.com/marktantongco/ai-gateway-stack) | Meta-repo linking all components | ✅ Active |

### Individual Components

| Repository | Language | Description | Stars |
|------------|----------|-------------|-------|
| [blacklisted-ai-proxy](https://github.com/marktantongco/blacklisted-ai-proxy) | Node.js | Web UI + API gateway | ⭐ |
| [grokbuild-proxy](https://github.com/marktantongco/grokbuild-proxy) | Go | Grok API proxy + multi-account | ⭐ |
| [turnstile-solver](https://github.com/marktantongco/turnstile-solver) | Python | Cloudflare Turnstile solver | ⭐ |
| [grok-register](https://github.com/marktantongco/grok-register) | Python | Account registration + OAuth | ⭐ |

### Infrastructure

| Repository | Language | Description | Stars |
|------------|----------|-------------|-------|
| [thermoptic](https://github.com/marktantongco/thermoptic) | Python | Shared egress proxy (MITM) | ⭐ |
| [phantomsignal](https://github.com/marktantongco/phantomsignal) | Python | Analytics + monitoring | ⭐ |
| [workstation-backup](https://github.com/marktantongco/workstation-backup) | Shell | Full ecosystem backup | ⭐ |

---

## 🌳 Worktree Structure

```
/home/x3/workspace/
├── ai-gateway-complete/          # Main combined repo
│   ├── components/
│   │   ├── blacklisted-ai-proxy/
│   │   ├── grokbuild-proxy/
│   │   ├── turnstile-solver/
│   │   └── grok-register/
│   ├── config/
│   ├── scripts/
│   └── docs/
├── ai-gateway-stack/             # Meta-repo
├── BlacklistedAIProxy/           # Standalone (original)
├── grokbuild-proxy/              # Standalone (original)
├── turnstile_solver/             # Standalone (original)
├── grok-register/                # Standalone (original)
├── Thermoptic/                   # Standalone
└── workstation-backup/           # Backup repo
```

### Git Worktree Commands

```bash
# List all worktrees
git worktree list

# Add new worktree
git worktree add ../feature-branch feature-branch

# Remove worktree
git worktree remove ../feature-branch
```

---

## 📁 Directory Structure

```
ai-gateway-complete/
├── components/
│   ├── blacklisted-ai-proxy/    # Web UI + API gateway
│   ├── grokbuild-proxy/         # Grok API proxy
│   ├── turnstile-solver/        # Turnstile solver
│   └── grok-register/           # Account registration
├── config/
│   ├── blacklisted-api.service  # Systemd: BlacklistedAIProxy
│   ├── grokbuild-proxy.service  # Systemd: GrokBuild Proxy
│   └── turnstile-solver.service # Systemd: Turnstile Solver
├── scripts/
│   ├── start-all.sh             # Start all services
│   ├── stop-all.sh              # Stop all services
│   ├── refresh-proxies.sh       # Refresh proxy list
│   └── health-check.sh          # Verify all services
├── docs/
│   ├── installation.md          # Setup instructions
│   ├── architecture.md          # System design
│   ├── troubleshooting.md       # Common issues
│   └── api-reference.md         # API documentation
├── README.md                    # This file
├── LICENSE                      # MIT License
└── docker-compose.yml           # Docker orchestration
```

---

## 🚀 Installation

### Option 1: Docker (Recommended)

```bash
# Clone
git clone https://github.com/marktantongco/ai-gateway-complete.git
cd ai-gateway-complete

# Start all services
docker compose up -d

# Verify
./scripts/health-check.sh
```

### Option 2: Manual Installation

```bash
# See docs/installation.md for detailed instructions
```

### Option 3: Omarchy Linux Installer

```bash
# One-command installer for Omarchy/Arch Linux
curl -sL https://raw.githubusercontent.com/marktantongco/ai-gateway-complete/main/install.sh | bash
```

---

## ⚙️ Ports Reference

| Port | Service | Protocol | Description |
|------|---------|----------|-------------|
| 3005 | BlacklistedAIProxy | HTTP | Main API endpoint |
| 8090 | GrokBuild Proxy | HTTP | Grok API proxy |
| 8088 | Turnstile Solver | HTTP | Turnstile solving |
| 1234 | Thermoptic | HTTP | Shared egress proxy |
| 14111 | Thermoptic | HTTPS | Secure egress |

---

## 🎯 API Examples

### BlacklistedAIProxy

```bash
# Chat completion
curl -X POST http://localhost:3005/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "model": "grok-4.6",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Turnstile Solver

```bash
# Solve Turnstile
curl -X GET http://localhost:8088/solve \
  -H "Content-Type: application/json" \
  -H "secret: turnstile123" \
  -d '{"site_url":"https://grok.com","site_key":"0x4AAAAAAA..."}'
```

### GrokBuild Proxy

```bash
# Health check
curl http://localhost:8090/health

# Claude format
curl -X POST http://localhost:8090/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-admin-key" \
  -d '{
    "model": "grok-4.6",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

---

## 📊 System Requirements

| Component | RAM | CPU | Disk |
|-----------|-----|-----|------|
| BlacklistedAIProxy | 512MB | 1 core | 1GB |
| GrokBuild Proxy | 256MB | 1 core | 500MB |
| Turnstile Solver | 2GB | 2 cores | 5GB |
| Grok Register | 256MB | 1 core | 500MB |
| **Total** | **3GB** | **5 cores** | **7GB** |

---

## 🔐 Security Notes

- All services bind to `127.0.0.1` by default
- Never commit `.env` files
- Rotate API keys regularly
- Use Thermoptic for outbound proxying

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Installation Guide](docs/installation.md) | Complete setup instructions |
| [Architecture](docs/architecture.md) | System design details |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and fixes |
| [API Reference](docs/api-reference.md) | Endpoint documentation |

---

## 🗺️ Roadmap

```
┌─────────────────────────────────────────────────────────────────┐
│  v1.0 (Current)  │  v1.1 (Planned)  │  v2.0 (Future)          │
├───────────────────┼──────────────────┼─────────────────────────┤
│  ✅ All components│  🔄 Web UI       │  🌐 Multi-tenant        │
│  ✅ Docker support│  📊 Dashboard    │  🔌 Plugin system       │
│  ✅ Proxy rotation│  🔄 Auto-refresh │  🤖 AI auto-solve       │
│  ✅ Multi-account │  📝 Audit logs   │  🌍 Multi-region        │
└───────────────────┴──────────────────┴─────────────────────────┘
```

---

## 📋 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-09-14 | Initial release with all components |
| 0.9.0 | 2026-09-13 | Turnstile solver + proxy rotation |
| 0.8.0 | 2026-09-12 | GrokBuild proxy + multi-account |
| 0.7.0 | 2026-09-11 | BlacklistedAIProxy translations |

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

```
┌─────────────────────────────────────────────────────────────────┐
│                   Made with ❤️ by                               │
│                  marktantongco                                  │
│                                                                 │
│  ⭐ Star this repo if you find it useful!                       │
└─────────────────────────────────────────────────────────────────┘
```

</div>

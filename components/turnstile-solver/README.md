<div align="center">

```
 ████████╗██╗ ██████╗██╗  ██╗███████╗████████╗
 ╚══██╔══╝██║██╔════╝██║ ██╔╝██╔════╝╚══██╔══╝
    ██║   ██║██║     █████╔╝ █████╗     ██║
    ██║   ██║██║     ██╔═██╗ ██╔══╝     ██║
    ██║   ██║╚██████╗██║  ██╗███████╗   ██║
    ╚═╝   ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝   ╚═╝
```

# 🛡️ Turnstile Solver + 2Captcha Fallback

**Self-hosted Cloudflare Turnstile solver with proxy rotation and API fallback**

[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/Version-3.16-blue?style=for-the-badge)](VERSION)

```
┌─────────────────────────────────────────────────────────────┐
│  🔄 172 SOCKS5 Proxies  │  🤖 Patchright Chromium  │  ☁️ 2Captcha │
└─────────────────────────────────────────────────────────────┘
```

</div>

---

## ⚡ Quick Start (3 Commands)

```bash
# 1. Clone and enter
git clone https://github.com/marktantongco/turnstile-solver.git
cd turnstile-solver

# 2. Start with Docker
sudo docker compose -f docker-compose.override.yml up -d

# 3. Test
curl -H "secret: turnstile123" http://localhost:8088/
```

---

## 🔄 Proxy Refresh (Do This First!)

> **⚠️ IMPORTANT: Free proxies die fast. Refresh before each use.**

```bash
# Auto-refresh: fetch fresh SOCKS5 proxies
curl -s https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt \
  | grep -v '^#' | sort -u | head -100 > proxies_new.txt

# Merge with existing (deduplicate)
cat proxies_new.txt proxies.txt | sort -u > proxies_merged.txt
mv proxies_merged.txt proxies.txt

# Restart solver to load new proxies
sudo docker compose -f docker-compose.override.yml restart
```

### 📊 Proxy Sources Matrix

| Source | Stars | Update Freq | Reliability | Protocol |
|--------|-------|-------------|-------------|----------|
| `monosans/proxy-list` | ⭐⭐⭐⭐ | Hourly | 🟢 High | SOCKS5 |
| `VPSLabCloud/VPSLab-Free-Proxy-List` | ⭐⭐⭐ | 15 min | 🟢 High | SOCKS5 |
| `proxifly/free-proxy-list` | ⭐⭐⭐⭐⭐ | 5 min | 🟡 Medium | SOCKS5 |
| `gfpcom/free-proxy-list` | ⭐⭐⭐⭐ | Hourly | 🟡 Medium | SOCKS5+HTTP |
| `hproxy-com/free-proxy-list` | ⭐⭐⭐ | Continuous | 🟢 High | All |

---

## 🏗️ Architecture

```
                    ┌──────────────────────────────────────────┐
                    │            TURNSTILE SOLVER              │
                    │                                          │
  ┌──────────┐     │  ┌────────────┐    ┌────────────────┐   │     ┌──────────┐
  │  Request │────▶│  │   Solver   │───▶│  2Captcha API  │   │────▶│  Token   │
  │  Client  │◀────│  │  (Local)   │    │   (Fallback)   │   │◀────│  Result  │
  └──────────┘     │  └─────┬──────┘    └────────────────┘   │     └──────────┘
                    │        │                                │
                    │        ▼                                │
                    │  ┌────────────┐                        │
                    │  │   Proxy    │                        │
                    │  │  Rotation  │                        │
                    │  └─────┬──────┘                        │
                    │        │                                │
                    └────────┼────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ SOCKS5-1 │  │ SOCKS5-2 │  │ SOCKS5-N │
        │ 77.110.x │  │ 46.173.x │  │  5.231.x │
        └──────────┘  └──────────┘  └──────────┘
```

---

## 📦 Installation Guide

### 🐳 Option 1: Docker (Recommended)

```bash
# Prerequisites
docker --version    # Need 20.10+
docker compose version  # Need v2+

# Clone
git clone https://github.com/marktantongco/turnstile-solver.git
cd turnstile-solver

# Build and start
sudo docker compose -f docker-compose.override.yml build
sudo docker compose -f docker-compose.override.yml up -d

# Verify
sudo docker ps | grep turnstile
curl -H "secret: turnstile123" http://localhost:8088/
```

### 🐍 Option 2: Python (Development)

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install
pip install git+https://github.com/odell0111/turnstile_solver@main
patchright install chromium --with-deps

# Run
solver --port 8088 --secret turnstile123 --browser chromium --headless
```

### 🔧 Option 3: Systemd Service

```bash
# Copy service file
sudo cp turnstile-solver.service /etc/systemd/system/

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable turnstile-solver
sudo systemctl start turnstile-solver

# Check status
sudo systemctl status turnstile-solver
```

---

## 🎯 API Reference

### Health Check

```bash
curl -H "secret: turnstile123" http://localhost:8088/
# Returns: {"status": "ok"}
```

### Solve Turnstile

```bash
curl -X GET http://localhost:8088/solve \
  -H "Content-Type: application/json" \
  -H "secret: turnstile123" \
  -d '{"site_url":"https://example.com","site_key":"0x4AAAAAAA..."}'
```

**Response:**
```json
{
  "status": "OK",
  "token": "0.<token>...",
  "elapsed": "12.34",
  "provider": "local"
}
```

### 2Captcha Fallback Wrapper

```bash
# Use the fallback wrapper for guaranteed uptime
python solve_turnstile.py --url "https://grok.com" --key "0x4AAAAAAA..."

# Or run as HTTP server
python solve_turnstile.py --server --port 8089
```

---

## 🔐 Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SOLVER_PORT` | `8088` | Server port |
| `SOLVER_SECRET` | `turnstile123` | API authentication |
| `MAX_ATTEMPTS` | `3` | Max solve attempts per request |
| `CAPTCHA_TIMEOUT` | `30` | Seconds to wait for Turnstile |
| `PAGE_LOAD_TIMEOUT` | `30` | Seconds to wait for page load |
| `PROXY_SERVER` | (none) | Single proxy override |
| `TWOCAPTCHA_KEY` | (none) | 2Captcha API key for fallback |

### Docker Compose Override

Edit `docker-compose.override.yml`:

```yaml
services:
  turnstile-solver:
    environment:
      - SOLVER_SECRET=your-secret-key
      - TWOCAPTCHA_KEY=your-2captcha-key
    volumes:
      - ./proxies.txt:/app/proxies.txt:ro
    deploy:
      resources:
        limits:
          memory: 4G  # Increase for heavy use
          cpus: "4"
```

---

## 📈 Performance Metrics

```
┌─────────────────────────────────────────────────────────────┐
│                    BENCHMARK RESULTS                        │
├─────────────────────────────────────────────────────────────┤
│  Metric              │ Value        │ Notes                 │
├──────────────────────┼──────────────┼───────────────────────┤
│  Cold Start          │ ~8s          │ Docker container      │
│  Warm Solve          │ 5-15s        │ Depends on site       │
│  Success Rate        │ ~85-95%      │ With proxy rotation   │
│  Proxies Loaded      │ 172          │ Free SOCKS5           │
│  Memory Usage        │ ~500MB       │ Chromium headless     │
│  CPU Usage           │ ~15%         │ During solve          │
└──────────────────────┴──────────────┴───────────────────────┘
```

---

## 🐛 Troubleshooting

### Container Won't Start

```bash
# Check logs
sudo docker logs turnstile-solver

# Common fix: rebuild
sudo docker compose -f docker-compose.override.yml down
sudo docker compose -f docker-compose.override.yml build --no-cache
sudo docker compose -f docker-compose.override.yml up -d
```

### Chrome Crashes in Docker

```
Solution: Use Chromium instead of Chrome
```

```bash
# In docker-compose.override.yml
environment:
  - SOLVER_BROWSER=chromium
```

### Proxies Not Loading

```bash
# Check proxy file format
head -5 proxies.txt
# Should show: socks5://ip:port

# Verify count
wc -l proxies.txt
```

---

## 🗺️ Roadmap

```
┌─────────────────────────────────────────────────────────────┐
│  v3.16 (Current)  │  v3.17 (Planned)  │  v4.0 (Future)    │
├────────────────────┼───────────────────┼────────────────────┤
│  ✅ Docker support │  🔄 Auto-refresh  │  🌐 Web UI         │
│  ✅ Proxy rotation │  📊 Stats dashboard│  🔌 Plugin system │
│  ✅ 2Captcha fallback│  🔄 Health check │  🤖 AI auto-solve │
│  ✅ Systemd service│  📝 Logging       │  🌍 Multi-region  │
└────────────────────┴───────────────────┴────────────────────┘
```

---

## 📋 Version History

| Version | Date | Changes |
|---------|------|---------|
| 3.16 | 2026-09-14 | Docker isolation, proxy rotation, 2Captcha fallback |
| 3.15 | 2026-09-10 | Patchright integration, headless mode |
| 3.14 | 2026-09-05 | Initial proxy support |
| 3.13 | 2026-08-28 | Basic Turnstile solving |

---

## 🤝 Contributing

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/turnstile-solver.git

# Create feature branch
git checkout -b feature/amazing-feature

# Commit
git commit -m "feat: add amazing feature"

# Push
git push origin feature/amazing-feature

# Open PR
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

```
┌─────────────────────────────────────────────────────────────┐
│                   Made with ❤️ by                           │
│                  marktantongco                              │
│                                                             │
│  ⭐ Star this repo if you find it useful!                   │
└─────────────────────────────────────────────────────────────┘
```

</div>

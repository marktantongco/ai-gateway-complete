# 🔄 Proxy Management

## Overview

The turnstile solver uses SOCKS5 proxies to rotate IP addresses for each Turnstile solve request. This prevents detection and rate limiting.

## 📊 Proxy Sources

| Source | Stars | Update Freq | Reliability | URL |
|--------|-------|-------------|-------------|-----|
| monosans/proxy-list | ⭐⭐⭐⭐ | Hourly | 🟢 High | [GitHub](https://github.com/monosans/proxy-list) |
| VPSLabCloud | ⭐⭐⭐ | 15 min | 🟢 High | [GitHub](https://github.com/VPSLabCloud/VPSLab-Free-Proxy-List) |
| proxifly/free-proxy-list | ⭐⭐⭐⭐⭐ | 5 min | 🟡 Medium | [GitHub](https://github.com/proxifly/free-proxy-list) |
| gfpcom | ⭐⭐⭐⭐ | Hourly | 🟡 Medium | [GitHub](https://github.com/gfpcom/free-proxy-list) |

## 🔄 Refresh Workflow

### Automatic Refresh (Cron)

```bash
# Add to crontab
crontab -e

# Refresh every 6 hours
0 */6 * * * cd /home/x3/workspace/turnstile_solver && ./refresh-proxies.sh
```

### Manual Refresh

```bash
#!/bin/bash
# refresh-proxies.sh

cd /home/x3/workspace/turnstile_solver

# Fetch fresh proxies
curl -s https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt \
  | grep -v '^#' | sort -u > proxies_new.txt

curl -s https://raw.githubusercontent.com/VPSLabCloud/VPSLab-Free-Proxy-List/main/socks5_all.txt \
  | grep -v '^#' | sort -u >> proxies_new.txt

# Merge and deduplicate
cat proxies_new.txt proxies.txt | sort -u > proxies_merged.txt
mv proxies_merged.txt proxies.txt

# Clean up
rm -f proxies_new.txt

# Restart solver
sudo docker compose -f docker-compose.override.yml restart

echo "Proxies refreshed: $(wc -l < proxies.txt) total"
```

## 📈 Proxy Format

### File Format (`proxies.txt`)

```
# Comments start with #
socks5://ip:port
socks5://ip:port@user:pass
```

### Examples

```plaintext
# Basic SOCKS5
socks5://77.110.104.9:1080

# With authentication
socks5://user:pass@proxy.example.com:1080

# Different port
socks5://192.168.1.1:9050
```

## 🎯 Rotation Strategy

The solver uses **round-robin rotation**:

```
Request 1 → Proxy A (77.110.104.9)
Request 2 → Proxy B (46.173.26.104)
Request 3 → Proxy C (158.160.128.27)
...
Request N → Proxy A (cycle repeats)
```

## 🔍 Proxy Validation

### Test Proxy Manually

```bash
# Test SOCKS5 proxy
curl --socks5 77.110.104.9:1080 https://httpbin.org/ip

# With authentication
curl --socks5 user:pass@proxy.example.com:1080 https://httpbin.org/ip
```

### Batch Validation

```bash
#!/bin/bash
# validate-proxies.sh

while IFS= read -r proxy; do
  # Skip comments
  [[ "$proxy" =~ ^#.*$ ]] && continue
  
  # Test proxy
  result=$(curl -s --socks5 "$proxy" --connect-timeout 5 https://httpbin.org/ip 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    echo "✅ $proxy"
  else
    echo "❌ $proxy"
  fi
done < proxies.txt
```

## 📊 Monitoring

### Check Loaded Proxies

```bash
# Via Docker logs
sudo docker logs turnstile-solver 2>&1 | grep "proxies loaded"

# Count proxies
wc -l proxies.txt
```

### Health Check

```bash
curl -H "secret: turnstile123" http://localhost:8088/
```

## ⚠️ Troubleshooting

### Proxies Not Loading

```bash
# Check file format
head -5 proxies.txt

# Verify no Windows line endings
file proxies.txt
# Should show: ASCII text

# Convert if needed
sed -i 's/\r$//' proxies.txt
```

### All Proxies Dead

```bash
# Force refresh
rm proxies.txt
./refresh-proxies.sh

# Check source availability
curl -s https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt | head -5
```

## 🔗 Related

- [Installation Guide](installation.md)
- [API Reference](../api/reference.md)
- [Troubleshooting](../troubleshooting/common-issues.md)

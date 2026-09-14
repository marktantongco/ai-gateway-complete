# 🐛 Troubleshooting

## Common Issues

### 1. Container Won't Start

**Symptoms:**
```bash
sudo docker ps | grep turnstile
# No output
```

**Diagnosis:**
```bash
sudo docker logs turnstile-solver
```

**Solutions:**

| Error | Solution |
|-------|----------|
| `port already in use` | Change port in `docker-compose.override.yml` |
| `permission denied` | Run with `sudo` |
| `image not found` | Rebuild: `sudo docker compose build --no-cache` |

**Fix:**
```bash
# Stop and rebuild
sudo docker compose -f docker-compose.override.yml down
sudo docker compose -f docker-compose.override.yml build --no-cache
sudo docker compose -f docker-compose.override.yml up -d
```

---

### 2. Chrome/Chromium Crashes

**Symptoms:**
```
ERROR: Failed to launch browser
```

**Cause:** Chrome doesn't work in Docker headless mode.

**Solution:** Use Chromium instead.

```yaml
# docker-compose.override.yml
environment:
  - SOLVER_BROWSER=chromium
```

```bash
sudo docker compose -f docker-compose.override.yml restart
```

---

### 3. Proxies Not Loading

**Symptoms:**
```
INFO: 0 proxies loaded
```

**Diagnosis:**
```bash
# Check file exists
ls -la proxies.txt

# Check format
head -5 proxies.txt

# Check line endings
file proxies.txt
```

**Solutions:**

| Issue | Fix |
|-------|-----|
| File empty | Run `./refresh-proxies.sh` |
| Windows line endings | `sed -i 's/\r$//' proxies.txt` |
| Wrong format | Ensure `socks5://ip:port` |

**Fix:**
```bash
# Refresh proxies
curl -s https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt \
  | grep -v '^#' | sort -u > proxies.txt

# Restart
sudo docker compose -f docker-compose.override.yml restart
```

---

### 4. Health Check Fails

**Symptoms:**
```bash
curl -H "secret: turnstile123" http://localhost:8088/
# Connection refused or 403
```

**Diagnosis:**
```bash
# Check container is running
sudo docker ps | grep turnstile

# Check logs
sudo docker logs turnstile-solver

# Test inside container
sudo docker exec turnstile-solver curl -H "secret: turnstile123" http://localhost:8088/
```

**Solutions:**

| Error | Fix |
|-------|-----|
| Connection refused | Container not running, restart it |
| 403 Forbidden | Wrong secret, check `SOLVER_SECRET` |
| Timeout | Container unhealthy, rebuild |

---

### 5. Solve Request Times Out

**Symptoms:**
```json
{
  "status": "error",
  "message": "TIMEOUT"
}
```

**Causes:**
- Turnstile site too slow
- Proxy too slow
- Network issues

**Solutions:**

```yaml
# Increase timeouts
environment:
  - CAPTCHA_TIMEOUT=60
  - PAGE_LOAD_TIMEOUT=60
```

```bash
sudo docker compose -f docker-compose.override.yml restart
```

---

### 6. 2Captcha Fallback Not Working

**Symptoms:**
```json
{
  "status": "error",
  "provider": "2captcha",
  "message": "INVALID_KEY"
}
```

**Solutions:**

| Error | Fix |
|-------|-----|
| `INVALID_KEY` | Check `TWOCAPTCHA_KEY` |
| `INSUFFICIENT_BALANCE` | Add funds to 2Captcha |
| `TIMEOUT` | Increase `CAPTCHA_TIMEOUT` |

**Fix:**
```bash
# Verify key
echo $TWOCAPTCHA_KEY

# Test key
curl "http://2captcha.com/res.php?key=$TWOCAPTCHA_KEY&action=getBalance"
```

---

### 7. Memory Issues

**Symptoms:**
```
Killed
OOMKilled
```

**Solutions:**

```yaml
# Increase memory limit
deploy:
  resources:
    limits:
      memory: 8G
```

```bash
# Monitor memory
sudo docker stats turnstile-solver
```

---

## 📊 Diagnostic Commands

### Quick Health Check

```bash
#!/bin/bash
# health-check.sh

echo "=== Container Status ==="
sudo docker ps | grep turnstile

echo "=== Health Endpoint ==="
curl -s -H "secret: turnstile123" http://localhost:8088/

echo "=== Proxy Count ==="
wc -l proxies.txt

echo "=== Recent Logs ==="
sudo docker logs --tail 10 turnstile-solver
```

### Full Diagnostic

```bash
#!/bin/bash
# diagnostic.sh

echo "=== System Info ==="
uname -a
docker --version

echo "=== Container Info ==="
sudo docker inspect turnstile-solver | jq '.[0].State'

echo "=== Network ==="
sudo docker inspect turnstile-solver | jq '.[0].NetworkSettings.Ports'

echo "=== Volumes ==="
sudo docker inspect turnstile-solver | jq '.[0].Mounts'

echo "=== Logs (last 50) ==="
sudo docker logs --tail 50 turnstile-solver
```

---

## 🔗 Related

- [Installation Guide](../guides/installation.md)
- [API Reference](../api/reference.md)
- [Proxy Management](../guides/proxy-management.md)

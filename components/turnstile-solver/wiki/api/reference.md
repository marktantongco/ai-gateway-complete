# 📡 API Reference

## Base URL

```
http://localhost:8088
```

## Authentication

All requests require the `secret` header:

```bash
-H "secret: turnstile123"
```

## Endpoints

### Health Check

```http
GET /
```

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| secret | Yes | API secret key |

**Response:**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl -H "secret: turnstile123" http://localhost:8088/
```

---

### Solve Turnstile

```http
GET /solve
```

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| Content-Type | Yes | application/json |
| secret | Yes | API secret key |

**Request Body:**
```json
{
  "site_url": "https://example.com",
  "site_key": "0x4AAAAAAA...",
  "action": "login",
  "cdata": "optional-data"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| site_url | string | Yes | URL of the page with Turnstile |
| site_key | string | Yes | Turnstile site key (0x4...) |
| action | string | No | Turnstile action parameter |
| cdata | string | No | Custom data to pass |

**Response (Success):**
```json
{
  "status": "OK",
  "token": "0.<token>...",
  "elapsed": "12.34",
  "provider": "local"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Failed to solve Turnstile",
  "error": "TIMEOUT"
}
```

**Example:**
```bash
curl -X GET http://localhost:8088/solve \
  -H "Content-Type: application/json" \
  -H "secret: turnstile123" \
  -d '{"site_url":"https://grok.com","site_key":"0x4AAAAAAA..."}'
```

---

### 2Captcha Fallback Wrapper

If the local solver fails, use the 2Captcha fallback:

```bash
python solve_turnstile.py \
  --url "https://grok.com" \
  --key "0x4AAAAAAA..." \
  --twocaptcha-key "YOUR_2CAPTCHA_KEY"
```

**As HTTP Server:**
```bash
python solve_turnstile.py --server --port 8089
```

**Endpoint:**
```http
POST /solve
```

**Request Body:**
```json
{
  "site_url": "https://example.com",
  "site_key": "0x4AAAAAAA...",
  "twocaptcha_key": "YOUR_2CAPTCHA_KEY"
}
```

---

## Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad request (missing parameters) |
| 401 | Unauthorized (wrong secret) |
| 403 | Forbidden |
| 500 | Server error |
| 503 | Solver unavailable |

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `TIMEOUT` | Turnstile took too long | Increase `CAPTCHA_TIMEOUT` |
| `PROXY_ERROR` | Proxy connection failed | Refresh proxies |
| `INVALID_KEY` | Wrong site_key | Verify key format |
| `RATE_LIMITED` | Too many requests | Wait or use more proxies |

---

## SDKs and Libraries

### Python

```python
import requests

def solve_turnstile(site_url, site_key, secret="turnstile123"):
    response = requests.get(
        "http://localhost:8088/solve",
        headers={
            "Content-Type": "application/json",
            "secret": secret
        },
        json={
            "site_url": site_url,
            "site_key": site_key
        }
    )
    return response.json()

# Usage
result = solve_turnstile("https://grok.com", "0x4AAAAAAA...")
print(result["token"])
```

### JavaScript

```javascript
async function solveTurnstile(siteUrl, siteKey, secret = "turnstile123") {
  const response = await fetch("http://localhost:8088/solve", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "secret": secret,
    },
    body: JSON.stringify({
      site_url: siteUrl,
      site_key: siteKey,
    }),
  });
  return response.json();
}

// Usage
const result = await solveTurnstile("https://grok.com", "0x4AAAAAAA...");
console.log(result.token);
```

### cURL

```bash
# Health check
curl -H "secret: turnstile123" http://localhost:8088/

# Solve
curl -X GET http://localhost:8088/solve \
  -H "Content-Type: application/json" \
  -H "secret: turnstile123" \
  -d '{"site_url":"https://grok.com","site_key":"0x4AAAAAAA..."}'
```

---

## Rate Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Requests/second | 10 | Per IP |
| Concurrent solves | 5 | Per container |
| Daily requests | Unlimited | With proxy rotation |

---

## 🔗 Related

- [Installation Guide](../guides/installation.md)
- [Proxy Management](../guides/proxy-management.md)
- [Troubleshooting](../troubleshooting/common-issues.md)

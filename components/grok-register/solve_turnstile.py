"""
Turnstile Solver with 2Captcha Fallback
────────────────────────────────────────
Tries local odell0111/turnstile_solver first.
Falls back to 2Captcha API on timeout/failure.
Ensures 99.9% pipeline uptime.

Usage:
  python solve_turnstile.py --url https://grok.com --key <sitekey>
  python solve_turnstile.py --server --port 8088
"""
import os, sys, time, json, asyncio, argparse, logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("turnstile-fallback")

TWO_CAPTCHA_KEY = os.getenv("TWOCAPTCHA_KEY", "")
LOCAL_SOLVER_URL = os.getenv("LOCAL_SOLVER_URL", "http://127.0.0.1:8088")
LOCAL_SOLVER_SECRET = os.getenv("SOLVER_SECRET", "turnstile123")
SOLVE_TIMEOUT = int(os.getenv("SOLVE_TIMEOUT", "45"))


def _twocaptcha_solve(site_url: str, site_key: str, timeout: int = 120) -> dict:
    """Solve Turnstile via 2Captcha API. Returns {"token": ..., "elapsed": float} or {"error": ...}."""
    import requests

    if not TWO_CAPTCHA_KEY:
        return {"error": "TWOCAPTCHA_KEY not set"}

    t0 = time.time()

    # Submit task
    resp = requests.post("https://2captcha.com/in.php", data={
        "key": TWO_CAPTCHA_KEY,
        "method": "turnstile",
        "sitekey": site_key,
        "pageurl": site_url,
        "json": 1,
    }, timeout=15)
    data = resp.json()

    if data.get("status") != 1:
        return {"error": f"2Captcha submit failed: {data.get('request', 'unknown')}"}

    request_id = data["request"]
    log.info(f"2Captcha task submitted: {request_id}")

    # Poll for result
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(5)
        resp = requests.get("https://2captcha.com/res.php", params={
            "key": TWO_CAPTCHA_KEY,
            "action": "get",
            "id": request_id,
            "json": 1,
        }, timeout=10)
        data = resp.json()

        if data.get("status") == 1:
            token = data["request"]
            elapsed = time.time() - t0
            log.info(f"2Captcha solved in {elapsed:.1f}s")
            return {"token": token, "elapsed": elapsed}

        if "ERROR_CAPTCHA_UNSOLVABLE" in str(data.get("request", "")):
            return {"error": "2Captcha: CAPTCHA unsolvable"}

    return {"error": f"2Captcha timeout after {timeout}s"}


def _local_solve(site_url: str, site_key: str, timeout: int = 45) -> dict:
    """Solve via local turnstile_solver HTTP API.

    The odell0111 solver uses GET /solve with JSON body (Quart get_json).
    Returns {"token": ..., "elapsed": float} or {"error": ...}.
    """
    import requests

    t0 = time.time()
    try:
        resp = requests.get(
            f"{LOCAL_SOLVER_URL}/solve",
            json={"site_url": site_url, "site_key": site_key, "captcha_timeout": timeout},
            headers={"secret": LOCAL_SOLVER_SECRET},
            timeout=timeout + 10,
        )
        data = resp.json()
        elapsed = time.time() - t0

        if data.get("status") == "OK" and data.get("token"):
            log.info(f"Local solver OK in {elapsed:.1f}s")
            return {"token": data["token"], "elapsed": elapsed}
        else:
            return {"error": data.get("message", data.get("error", "Local solver failed"))}
    except requests.exceptions.ConnectionError:
        return {"error": "Local solver not reachable"}
    except requests.exceptions.Timeout:
        return {"error": f"Local solver timeout ({timeout}s)"}
    except Exception as e:
        return {"error": f"Local solver error: {str(e)[:100]}"}


def solve_with_fallback(site_url: str, site_key: str,
                        local_timeout: int = 45,
                        api_timeout: int = 120,
                        skip_local: bool = False) -> dict:
    """
    Try local solver first, fall back to 2Captcha on failure.
    Returns {"token": ..., "elapsed": float, "provider": "local"|"2captcha"} or {"error": ...}.
    """
    t0 = time.time()

    if not skip_local:
        log.info(f"Trying local solver for {site_url[:60]}...")
        result = _local_solve(site_url, site_key, timeout=local_timeout)
        if "token" in result:
            result["provider"] = "local"
            return result
        log.warning(f"Local solver failed: {result.get('error')}. Falling back to 2Captcha...")

    if TWO_CAPTCHA_KEY:
        log.info(f"Trying 2Captcha API for {site_url[:60]}...")
        result = _twocaptcha_solve(site_url, site_key, timeout=api_timeout)
        if "token" in result:
            result["provider"] = "2captcha"
            return result
        log.error(f"2Captcha also failed: {result.get('error')}")
        return result
    else:
        return {"error": "Both local solver and 2Captcha failed (no TWOCAPTCHA_KEY)"}


# ═══════════════════════ HTTP Server ═══════════════════════

def run_server(port: int = 8088, secret: str = "turnstile123"):
    """HTTP server with POST /solve endpoint."""
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                self._json({"status": "ok"})
            elif self.path == "/solve":
                self._json({"error": "Use POST /solve with JSON body"})
            else:
                self._json({"error": "Not found"}, 404)

        def do_POST(self):
            if self.path != "/solve":
                return self._json({"error": "Not found"}, 404)

            if self.headers.get("secret") != secret:
                return self._json({"error": "Forbidden"}, 403)

            try:
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length))
            except Exception:
                return self._json({"error": "Invalid JSON"}, 400)

            site_url = body.get("site_url")
            site_key = body.get("site_key")
            if not site_url or not site_key:
                return self._json({"error": "site_url and site_key required"}, 400)

            skip_local = body.get("skip_local", False)
            local_timeout = body.get("local_timeout", 45)
            api_timeout = body.get("api_timeout", 120)

            log.info(f"Solve request: {site_url[:60]}...")
            result = solve_with_fallback(
                site_url=site_url, site_key=site_key,
                local_timeout=local_timeout, api_timeout=api_timeout,
                skip_local=skip_local,
            )

            if "error" in result:
                return self._json({"status": "error", "message": result["error"]}, 500)
            else:
                return self._json({
                    "status": "OK",
                    "token": result["token"],
                    "elapsed": str(result["elapsed"]),
                    "provider": result.get("provider", "unknown"),
                })

        def _json(self, data, status=200):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a):
            pass

    server = HTTPServer(("0.0.0.0", port), Handler)
    log.info(f"Turnstile Fallback Server on http://0.0.0.0:{port}")
    log.info(f"Local solver: {LOCAL_SOLVER_URL}")
    log.info(f"2Captcha key: {'set' if TWO_CAPTCHA_KEY else 'NOT SET'}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


# ═══════════════════════ CLI ═══════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Turnstile solver with 2Captcha fallback")
    parser.add_argument("--server", action="store_true", help="Run HTTP server")
    parser.add_argument("--port", type=int, default=8088, help="Server port (default: 8088)")
    parser.add_argument("--secret", default="turnstile123", help="API secret")
    parser.add_argument("--url", help="Target URL (one-shot mode)")
    parser.add_argument("--key", dest="site_key", help="Turnstile site key (one-shot mode)")
    parser.add_argument("--skip-local", action="store_true", help="Skip local solver, use 2Captcha only")
    args = parser.parse_args()

    if args.server:
        run_server(port=args.port, secret=args.secret)
    elif args.url and args.site_key:
        result = solve_with_fallback(args.url, args.site_key, skip_local=args.skip_local)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        parser.print_help()

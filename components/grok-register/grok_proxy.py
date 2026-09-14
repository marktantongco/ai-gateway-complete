#!/usr/bin/env python3
"""
Personal Grok proxy: OpenAI-compatible /v1 on localhost.
Async: concurrent requests across accounts, background refresh, failover on any upstream error.
Usage: uvicorn grok_proxy:app --port 8099
"""
import json, os, glob, time, threading, asyncio, urllib.parse
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse, Response
import httpx

AUTH_DIR = "/root/grok-register/auths"
BASE = "https://cli-chat-proxy.grok.com/v1"
TOKEN_ENDPOINT = "https://auth.x.ai/oauth2/token"
CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
REDIRECT_URI = "http://127.0.0.1:56121/callback"
MY_KEY = os.getenv("GROK_PROXY_KEY", "")

app = FastAPI()
# 90s default: under CF's 100s tunnel ceiling, a stalled upstream fails over instead of CF 524ing.
# Per-read timeout, so actively streaming responses are unaffected.
client = httpx.AsyncClient(timeout=90.0)
sync_client = httpx.Client(timeout=30)  # sync client for background refresh only
lock = threading.Lock()
accounts = []
rr_index = 0
COOLDOWN = 300  # seconds to skip an account after upstream failure
REFRESH_MARGIN = 300  # refresh 5 min before expiry
REFRESH_INTERVAL = 60  # background refresher cadence


def load_accounts():
    global accounts
    accounts = []
    for fn in sorted(glob.glob(os.path.join(AUTH_DIR, "xai-*.json"))):
        try:
            with open(fn) as f:
                d = json.load(f)
            if d.get("access_token") and not d.get("disabled"):
                d["_path"] = fn
                accounts.append(d)
        except Exception:
            pass
    print(f"[grok-proxy] loaded {len(accounts)} accounts")


def refresh(acc):
    try:
        r = sync_client.post(TOKEN_ENDPOINT, data={
            "grant_type": "refresh_token",
            "refresh_token": acc["refresh_token"],
            "client_id": CLIENT_ID,
            "redirect_uri": REDIRECT_URI,
        }, timeout=30)
        if r.status_code != 200:
            print(f"[grok-proxy] refresh failed {acc.get('email')}: {r.status_code}")
            return
        d = r.json()
        acc["access_token"] = d["access_token"]
        if d.get("refresh_token"):
            acc["refresh_token"] = d["refresh_token"]
        acc["expires_in"] = d.get("expires_in", 21600)
        acc["_ts"] = time.time()
        with open(acc["_path"], "w") as f:
            json.dump(acc, f, ensure_ascii=False, indent=2)
        print(f"[grok-proxy] refreshed {acc.get('email')}")
    except Exception as e:
        print(f"[grok-proxy] refresh error {acc.get('email')}: {e}")


def _refresh_loop():
    while True:
        time.sleep(REFRESH_INTERVAL)
        try:
            now = time.time()
            with lock:
                for acc in accounts:
                    ts = acc.get("_ts", 0)
                    exp = acc.get("expires_in", 21600)
                    if now - ts > exp - REFRESH_MARGIN:
                        refresh(acc)
        except Exception as e:
            print(f"[grok-proxy] refresh loop error: {e}")


def get_token():
    global rr_index
    with lock:
        n = len(accounts)
        if not n:
            raise HTTPException(503, "no accounts")
        for _ in range(n):
            acc = accounts[rr_index % n]
            rr_index += 1
            if acc.get("_cooldown_until", 0) > time.time():
                continue
            ts = acc.get("_ts", 0)
            exp = acc.get("expires_in", 21600)
            if time.time() - ts > exp - REFRESH_MARGIN:
                refresh(acc)
            return acc["access_token"], acc
    raise HTTPException(503, "all accounts in cooldown")


def mark_cooldown(acc):
    acc["_cooldown_until"] = time.time() + COOLDOWN
    print(f"[grok-proxy] {acc.get('email')} cooling down {COOLDOWN}s")


@app.on_event("startup")
def _startup():
    load_accounts()
    threading.Thread(target=_refresh_loop, daemon=True).start()
    if accounts:
        with lock:
            refresh(accounts[0]) if not accounts[0].get("_ts") else None


def _headers(acc):
    return {
        "Authorization": f"Bearer {acc['access_token']}",
        "Content-Type": "application/json",
        "X-XAI-Token-Auth": "xai-grok-cli",
        "x-grok-client-version": "0.2.93",
        "x-grok-client-identifier": "grok-shell",
    }


def _check_key(req: Request):
    auth = req.headers.get("Authorization", "")
    if auth != f"Bearer {MY_KEY}":
        raise HTTPException(401, "bad key")


@app.get("/v1/models")
def models(req: Request):
    _check_key(req)
    return {"object": "list", "data": [
        {"id": "grok-4.6", "object": "model", "owned_by": "xai"},
        {"id": "grok-4.5", "object": "model", "owned_by": "xai"},
    ]}


async def _send_upstream(path: str, body: bytes, j: dict | None, is_image: bool = False):
    """Try accounts in RR order until one succeeds. Returns (status, resp) or raises after exhausting."""
    last_err = None
    for attempt in range(len(accounts) or 1):
        tok, acc = get_token()
        headers = _headers(acc)
        headers["Content-Length"] = str(len(body))
        req_headers = dict(headers)
        try:
            upstream = client.build_request("POST", f"{BASE}/{path}", content=body, headers=req_headers)
            r = await client.send(upstream, stream=True)
            print(f"[grok-proxy] {path} via {acc.get('email')} -> {r.status_code}")
            if r.status_code in (429, 401):
                await r.aread()
                mark_cooldown(acc)
                continue
            if r.status_code >= 500:
                await r.aread()
                mark_cooldown(acc)
                continue
            return r, acc
        except (httpx.HTTPError, httpx.TimeoutException, httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout) as e:
            print(f"[grok-proxy] {path} timeout/error via {acc.get('email')}: {type(e).__name__}")
            mark_cooldown(acc)
            last_err = e
    if last_err:
        raise last_err
    return None, None


@app.post("/v1/chat/completions")
async def chat(req: Request):
    _check_key(req)
    body = await req.body()
    # strip unknown fields that grok may reject
    try:
        j = json.loads(body)
    except Exception:
        j = None
    if j:
        j.pop("stream_options", None)
        j.pop("user", None)
        # opencode (@ai-sdk/openai-compatible) sends model-variant body overlays
        # as a nested top-level "body" object (e.g. body.reasoning_effort).
        # Flatten it into the request so xAI's top-level reasoning_effort works.
        overlay = j.pop("body", None)
        if isinstance(overlay, dict):
            for k, v in overlay.items():
                if k not in j:
                    j[k] = v
        body = json.dumps(j).encode()
    r, acc = await _send_upstream("chat/completions", body, j)
    if r is None:
        return Response(content=b'{"error":{"message":"all accounts rate limited"}}', status_code=429, media_type="application/json")
    if r.status_code != 200:
        return Response(content=await r.aread(), status_code=r.status_code, media_type="application/json")
    if j and j.get("stream"):
        return StreamingResponse(r.aiter_raw(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})
    return Response(content=await r.aread(), media_type="application/json")


@app.post("/v1/images/generations")
async def image(req: Request):
    _check_key(req)
    body = await req.body()
    r, acc = await _send_upstream("images/generations", body, None, is_image=True)
    if r is None:
        return Response(content=b'{"error":{"message":"all accounts rate limited"}}', status_code=429, media_type="application/json")
    return Response(content=await r.aread(), status_code=r.status_code, media_type="application/json")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8099)

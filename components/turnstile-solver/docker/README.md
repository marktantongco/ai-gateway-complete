## 🐳 Docker

### 🚧 Pre-Release Developer Notice

**Important Context**  
This release has been marked as experimental because:  
⚠️ **I have been unable to personally validate the build** due to:

- Unstable power infrastructure
- Unreliable internet connectivity

**Your Contribution is needed !!**

### 🛠️ Build Instructions

#### 1. Clone Repository

```bash
git clone https://github.com/odell0111/turnstile_solver.git
cd turnstile_solver
```

#### 2. Set-Up Custom Builder - MultiArch Build

```bash
# 1. Initialize Buildx
docker buildx create --use --name multiarch-builder
docker buildx inspect --bootstrap

# 2. Build and push multi-arch images
docker buildx bake --set "*.platform=linux/amd64,linux/arm64" --set "*.tags=turnstile_solver/solver:latest" --push

# AMD64 Build
docker buildx build --platform linux/amd64 -t solver:amd64-latest .
# ARM64 Build
# docker buildx build --platform linux/arm64 -t solver:arm64-latest .

# Multi-Arch Manifest
docker buildx imagetools create -t solver:multiarch-latest solver:amd64-latest solver:arm64-latest
```

##### Set-up optional .env file at `docker-compose.yml` level:

- `TZ` - Set your [IANA timezone](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones). Example: Europe/London, Asia/Dubai). Default: **_America/New_York_**
- `START_SERVER`:
    - **false** - Manual start required (default)
    - **true** - Auto-start with default config
- `SOLVER_SERVER_PORT` - Turnstile Solver server port. Default: **_8088_**
- `SOLVER_BROWSER` - Patchright browser to install and use on auto-start build:
    - **chrome** (default and recommended)
    - **chromium**
- `USER` - Needed by VNC Server. Default: **_Perico_**
- `REMOTE_DESKTOP_PROTOCOL`:
    - **RDP** - Xrdp
    - **VNC** - VNC/TightVNC
    - [any] - No start remote desktop server
- TightVNC Server:
    - `VNC_PASSWORD` - Password. Default: **_12312312_**
    - `VNC_PORT` - Port. Default: **_5901_**
    - `VNC_GEOMETRY` - Geometry. Default: **_1280x720_**
    - `VNC_DPI` - DPI. Default: **_70_**
    - `VNC_DEPTH` - Depth. Default: **_24_**
- Xrdp:
    - `XRDP_PORT` - Xrdp port. Default: **_3389_**

#### 3. Platform-Specific Deployment

```bash
# For AMD64 hosts
docker compose --profile amd64 up

# For ARM64 hosts
#docker compose --profile arm64 up
```

### 🔌 Remote Access Configuration

**RDP**:

1. **Client Software**:
    - Windows: Built-in Remote Desktop Connection
    - Linux: `Remmina` or `FreeRDP`
    - macOS: Microsoft Remote Desktop

2. **Connection Details**:
    - Address (default): `localhost:3389`
    - Credentials:
        - Username: `root`
        - Password: `root` (❗Change after first login)

⚠️ **Security Notice**: Default credentials pose significant risk - change immediately after initial setup!

**VNC/TightVNC**:

1. **Client Software**:
    - Windows: `RealVNC Viewer`, `TightVNC` (tvnviewer.exe)
    - Linux: `xtightvncviewer` (vncviewer/xtightvncviewer)
    - macOS: `?` # TODO
2. **Connection Details**:
    - Address (default): `localhost:5901`

**Example connection with TightVNC Viewer on Windows**:

```cmd
tvnviewer.exe 2.tcp.ngrok.io:17774 -password=12345678 -useclipboard=yes -mousecursor=no -jpegimagequality=2 -compressionlevel=2
```

3. **Post-Connection (Start server with desired parameters)**:

```bash
python3 solver
```

---

### 🤔 VNC vs RDP

**Protocol Comparison**:

| Feature               | RDP                 | VNC                 |
|-----------------------|---------------------|---------------------|
| Performance           | ✅ Optimized         | ⚠️ Bandwidth-heavy  |
| Security              | ✅ Native encryption | 🔄 Depends on setup |
| Cross-Platform        | ✅ Excellent         | ✅ Universal         |
| File Transfer         | ✅ Built-in          | ❌ Requires add-ons  |
| Multi-Monitor Support | ✅ Native            | ✅ Possible          |

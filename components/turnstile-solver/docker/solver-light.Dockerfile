FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LC_ALL=en_US.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git locales && \
    sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir \
    git+https://github.com/odell0111/turnstile_solver@main

RUN patchright install chromium --with-deps

COPY docker/entrypoint-light.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -sf -H "secret: turnstile123" http://127.0.0.1:8088/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]

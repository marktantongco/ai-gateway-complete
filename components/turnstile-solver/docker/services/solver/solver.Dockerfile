ARG BASE_IMAGE=ubuntu:latest
FROM --platform=$BUILDPLATFORM ${BASE_IMAGE} AS builder

# Multi-stage build setup
FROM --platform=$TARGETPLATFORM ${BASE_IMAGE}

# Copy architecture-specific binaries
COPY --from=builder /build-output /app

# Configure locale and timezone
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install --no-install-recommends -y tzdata locales
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
RUN echo "LC_ALL=en_US.UTF-8" >> /etc/environment
RUN echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen
RUN echo "LANG=en_US.UTF-8" > /etc/locale.conf
RUN locale-gen en_US.UTF-8

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    python3-pip \
    xorgxrdp \
    xrdp \
    tightvncserver \
    xfonts-75dpi  \
    xfonts-100dpi  \
    xfonts-base \
    xvfb \
    wget \
    screen \
    sudo \
    xfce4 \
    xfce4-goodies \
    dbus-x11 \
    xfce4-terminal

# Clean up
RUN apt remove -y light-locker xscreensaver && \
    apt autoremove -y && \
    rm -rf /var/cache/apt /var/lib/apt/lists

# Copy entrypoint script
COPY ./entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh

# Healthcheck (adjust as needed)
#HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
#    CMD netstat -an | grep $XRDP_PORT >/dev/null || exit 1

# Set entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
